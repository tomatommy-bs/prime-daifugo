/**
 * Pure lobby core (spec §8.2): prime room-id allocation, room counts reported by `RoomDO`, the
 * home page socket count, and a debounced stats broadcast driven by the alarm. `lobby-do.ts`
 * binds it to Cloudflare.
 */
import type { LobbyStats } from '../../src/shared/protocol'
import type { LobbyStorage } from './storage'

/** Allocated ids are primes below this (spec §8.2). */
export const PRIME_LIMIT = 1_000_000
/** A fresh id is reserved this long so its creator can connect (RQ-L3). */
export const RESERVATION_MS = 10 * 60_000
/** Rows with `count > 0` and no report for this long are dropped (RQ-L2). */
export const STALE_ROW_MS = 12 * 60_000
/** At most one stats broadcast per this interval. */
export const BROADCAST_INTERVAL_MS = 1_000

export type LobbySocket = { send(text: string): void }

export type LobbyClock = { now(): number }

let sieve: Uint8Array | null = null

/** `isComposite[n] === 1` for composite n below `PRIME_LIMIT` (built once, lazily). */
function compositeTable(): Uint8Array {
  if (!sieve) {
    const table = new Uint8Array(PRIME_LIMIT)
    table[0] = 1
    table[1] = 1
    for (let i = 2; i * i < PRIME_LIMIT; i += 1) {
      if (table[i] === 0) {
        for (let j = i * i; j < PRIME_LIMIT; j += i) {
          table[j] = 1
        }
      }
    }
    sieve = table
  }
  return sieve
}

export class LobbyFullError extends Error {
  constructor() {
    super('no free prime room id')
  }
}

export class LobbyCore {
  private lastBroadcastAt = Number.NEGATIVE_INFINITY
  private broadcastPending = false

  constructor(
    private readonly storage: LobbyStorage,
    private readonly sockets: () => LobbySocket[],
    private readonly clock: LobbyClock,
  ) {}

  /** Smallest prime below 10^6 that is neither in use nor reserved, reserved for 10 min. */
  allocate(): string {
    const now = this.clock.now()
    this.purge(now)
    const busy = new Set<string>()
    for (const row of this.storage.listRows()) {
      if (row.count > 0 || (row.reservedUntil !== null && row.reservedUntil > now)) {
        busy.add(row.id)
      }
    }
    const composite = compositeTable()
    for (let n = 2; n < PRIME_LIMIT; n += 1) {
      const id = String(n)
      if (composite[n] === 0 && !busy.has(id)) {
        // Free rows were purged above, so this is always a new row.
        this.storage.upsertRow({
          id,
          count: 0,
          status: null,
          reservedUntil: now + RESERVATION_MS,
          updatedAt: now,
        })
        this.scheduleAlarm(now)
        return id
      }
    }
    throw new LobbyFullError()
  }

  /** A room's connected-member count changed (or its periodic refresh). */
  report(id: string, count: number, status: string | null): void {
    const now = this.clock.now()
    const prev = this.storage.getRow(id)
    const reserved = prev?.reservedUntil != null && prev.reservedUntil > now
    if (count <= 0) {
      if (reserved && prev) {
        this.storage.upsertRow({ ...prev, count: 0, status, updatedAt: now })
      } else if (prev) {
        this.storage.deleteRow(id)
      }
    } else {
      this.storage.upsertRow({
        id,
        count,
        status,
        reservedUntil: prev?.reservedUntil ?? null,
        updatedAt: now,
      })
    }
    this.markDirty(now)
  }

  /** The room was garbage-collected. */
  release(id: string): void {
    this.storage.deleteRow(id)
    this.markDirty(this.clock.now())
  }

  /** Current counters (stale rows dropped first). */
  stats(): LobbyStats {
    const now = this.clock.now()
    this.purge(now)
    const room: Record<string, number> = {}
    for (const row of this.storage.listRows()) {
      if (row.count > 0) {
        room[row.id] = row.count
      }
    }
    return { t: 'lobby', lobby: this.sockets().length, room }
  }

  /** A home page socket connected: it gets the stats at once; others get a debounced update. */
  onConnect(socket: LobbySocket): void {
    socket.send(JSON.stringify(this.stats()))
    this.markDirty(this.clock.now())
  }

  onDisconnect(): void {
    this.markDirty(this.clock.now())
  }

  onAlarm(): void {
    this.storage.alarmFired()
    const now = this.clock.now()
    const dropped = this.purge(now)
    if (dropped) {
      this.broadcastPending = true
    }
    if (this.broadcastPending && now - this.lastBroadcastAt >= BROADCAST_INTERVAL_MS) {
      this.broadcast(now)
    }
    this.scheduleAlarm(now)
  }

  /* ---------------------------------------------------------------- */

  private markDirty(now: number): void {
    if (now - this.lastBroadcastAt >= BROADCAST_INTERVAL_MS) {
      this.broadcast(now)
    } else {
      this.broadcastPending = true
    }
    this.scheduleAlarm(now)
  }

  private broadcast(now: number): void {
    this.broadcastPending = false
    this.lastBroadcastAt = now
    const sockets = this.sockets()
    if (sockets.length === 0) {
      return
    }
    const text = JSON.stringify(this.stats())
    for (const socket of sockets) {
      socket.send(text)
    }
  }

  /**
   * Drop rows of rooms that stopped reporting and rows whose reservation lapsed unused.
   * Returns whether a visible count changed.
   */
  private purge(now: number): boolean {
    let changed = false
    for (const row of this.storage.listRows()) {
      if (row.count > 0 && row.updatedAt + STALE_ROW_MS <= now) {
        this.storage.deleteRow(row.id)
        changed = true
      } else if (row.count <= 0 && (row.reservedUntil === null || row.reservedUntil <= now)) {
        this.storage.deleteRow(row.id)
      }
    }
    return changed
  }

  /** Alarm at the next pending broadcast or stale cutoff. */
  private scheduleAlarm(now: number): void {
    let wakeAt: number | null = null
    const consider = (t: number) => {
      if (wakeAt === null || t < wakeAt) {
        wakeAt = t
      }
    }
    if (this.broadcastPending) {
      consider(Math.max(now, this.lastBroadcastAt + BROADCAST_INTERVAL_MS))
    }
    // Only rooms that may go stale need a wake-up; lapsed reservations are purged on reads.
    for (const row of this.storage.listRows()) {
      if (row.count > 0) {
        consider(row.updatedAt + STALE_ROW_MS)
      }
    }
    const current = this.storage.getAlarm()
    if (wakeAt === null) {
      if (current !== null) {
        this.storage.deleteAlarm()
      }
    } else if (wakeAt !== current) {
      this.storage.setAlarm(wakeAt)
    }
  }
}
