/**
 * Simulated network between `SimClient`s and the `SimHost` (spec §12.1). Seeded and driven by
 * `SimClock`. Each `SimConn` is one WebSocket; delivery is FIFO per direction with a random delay.
 *
 * Faults:
 * - `reset`: the connection drops and both sides see a close (a blip, a server restart);
 * - `halfOpen`: frames stop flowing and nobody sees a close — the server finds out at its sweep,
 *   the client through its liveness timeout (45 s) or a resume trigger;
 * - client-driven faults (offline, sleep, reload, second tab, duplicate hello) live in `SimClient`.
 */
import type { Rng } from '../../game/types'
import type { SimClock } from './sim-clock'

/** The host side of the network. */
export interface ServerEnd {
  accept(conn: SimConn): void
  message(conn: SimConn, text: string): void
  closed(conn: SimConn): void
}

/** The client side of one connection. */
export interface ClientEnd {
  readonly online: boolean
  opened(conn: SimConn): void
  message(conn: SimConn, text: string): void
  closed(conn: SimConn, code: number): void
  /** no frame (pong included) for 45 s on `conn` */
  livenessTimeout(conn: SimConn): void
}

/** Client liveness timeout (spec §3.4). */
export const CLIENT_LIVENESS_MS = 45_000
/** Abnormal closure code seen by the browser for dropped sockets. */
export const ABNORMAL_CLOSE = 1006

let connIds = 0

export class SimConn {
  readonly id = ++connIds
  /** the client has seen `open` and not yet a close */
  clientOpen = false
  /** the host holds this socket */
  serverAttached = false
  /** half-open: frames are silently lost in both directions */
  dead = false
  /** since when no pings/pongs flow (half-open, or the client is asleep) */
  silentSince: number | null = null
  inFlightToClient = 0
  inFlightToServer = 0
  private lastToClient = 0
  private lastToServer = 0
  /* host-side attachment (spec §4.2 `serializeAttachment({pid, connNo})`) */
  pid: string | null = null
  connNo = 0
  helloDone = false

  readonly client: ClientEnd

  constructor(client: ClientEnd) {
    this.client = client
  }

  /** @internal */
  nextDelivery(toClient: boolean, at: number): number {
    if (toClient) {
      this.lastToClient = Math.max(this.lastToClient, at)
      return this.lastToClient
    }
    this.lastToServer = Math.max(this.lastToServer, at)
    return this.lastToServer
  }

  /** What `getWebSocketAutoResponseTimestamp()` would report at `now`. */
  lastPongAt(now: number): number {
    return this.silentSince ?? now
  }
}

export type SimNetworkOptions = { minDelayMs?: number; maxDelayMs?: number }

export class SimNetwork {
  server: ServerEnd | null = null
  private readonly minDelay: number
  private readonly maxDelay: number

  private readonly clock: SimClock
  private readonly rng: Rng

  constructor(clock: SimClock, rng: Rng, opts: SimNetworkOptions = {}) {
    this.clock = clock
    this.rng = rng
    this.minDelay = opts.minDelayMs ?? 5
    this.maxDelay = opts.maxDelayMs ?? 120
  }

  private delay(): number {
    return this.minDelay + Math.floor(this.rng.next() * (this.maxDelay - this.minDelay + 1))
  }

  /** Open a socket. Fails with a close if the client is offline. */
  open(client: ClientEnd): SimConn {
    const conn = new SimConn(client)
    const at = this.clock.now + this.delay()
    if (!client.online) {
      this.clock.schedule(at, () => client.closed(conn, ABNORMAL_CLOSE))
      return conn
    }
    this.clock.schedule(at, () => {
      if (conn.dead) {
        client.closed(conn, ABNORMAL_CLOSE)
        return
      }
      conn.serverAttached = true
      conn.clientOpen = true
      this.server?.accept(conn)
      client.opened(conn)
    })
    return conn
  }

  toServer(conn: SimConn, text: string): void {
    if (conn.dead || !conn.clientOpen) {
      return
    }
    conn.inFlightToServer += 1
    this.clock.schedule(conn.nextDelivery(false, this.clock.now + this.delay()), () => {
      conn.inFlightToServer -= 1
      if (!conn.dead && conn.serverAttached) {
        this.server?.message(conn, text)
      }
    })
  }

  toClient(conn: SimConn, text: string): void {
    if (conn.dead || !conn.serverAttached) {
      return
    }
    conn.inFlightToClient += 1
    this.clock.schedule(conn.nextDelivery(true, this.clock.now + this.delay()), () => {
      conn.inFlightToClient -= 1
      if (!conn.dead && conn.clientOpen) {
        conn.client.message(conn, text)
      }
    })
  }

  /** The client closes the socket (reload, reconnect, liveness timeout). */
  clientClose(conn: SimConn): void {
    if (!conn.clientOpen) {
      return
    }
    conn.clientOpen = false
    if (conn.dead || !conn.serverAttached) {
      return
    }
    this.clock.schedule(conn.nextDelivery(false, this.clock.now + this.delay()), () => {
      if (conn.serverAttached) {
        conn.serverAttached = false
        this.server?.closed(conn)
      }
    })
  }

  /** The host closes the socket with `code` (after a `bye`, a sweep, or GC). */
  serverClose(conn: SimConn, code: number): void {
    if (!conn.serverAttached) {
      return
    }
    conn.serverAttached = false
    if (conn.dead || !conn.clientOpen) {
      return
    }
    this.clock.schedule(conn.nextDelivery(true, this.clock.now + this.delay()), () => {
      if (conn.clientOpen) {
        conn.clientOpen = false
        conn.client.closed(conn, code)
      }
    })
  }

  /** The connection drops; both sides see a close. */
  reset(conn: SimConn): void {
    const at = this.clock.now + this.delay()
    if (conn.clientOpen) {
      this.clock.schedule(at, () => {
        if (conn.clientOpen) {
          conn.clientOpen = false
          conn.client.closed(conn, ABNORMAL_CLOSE)
        }
      })
    }
    if (conn.serverAttached) {
      this.clock.schedule(at, () => {
        if (conn.serverAttached) {
          conn.serverAttached = false
          this.server?.closed(conn)
        }
      })
    }
    conn.dead = true
    conn.silentSince ??= this.clock.now
  }

  /** The connection goes silent without a close on either side. */
  halfOpen(conn: SimConn): void {
    if (conn.dead) {
      return
    }
    conn.dead = true
    conn.silentSince ??= this.clock.now
    this.clock.after(CLIENT_LIVENESS_MS, () => {
      if (conn.clientOpen) {
        conn.client.livenessTimeout(conn)
      }
    })
  }

  /** The host vanished (deploy/restart): every socket it held drops with a close on the client. */
  dropFromServer(conn: SimConn): void {
    conn.serverAttached = false
    if (conn.clientOpen && !conn.dead) {
      this.clock.schedule(conn.nextDelivery(true, this.clock.now + this.delay()), () => {
        if (conn.clientOpen) {
          conn.clientOpen = false
          conn.client.closed(conn, ABNORMAL_CLOSE)
        }
      })
    }
  }
}
