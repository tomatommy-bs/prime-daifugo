/**
 * Pure lobby core (spec §8.2): prime room-id allocation, room counts reported by `RoomDO`, the
 * home page socket count, and a debounced stats broadcast driven by the alarm. `lobby-do.ts`
 * binds it to Cloudflare.
 */
import type { LobbyStats } from '../../src/shared/protocol'
import type { LobbyRow, LobbyStorage } from './storage'

/** Allocated ids are primes below this (spec §8.2). */
export const PRIME_LIMIT = 1_000_000
/** A fresh id is reserved this long so its creator can connect (RQ-L3). */
export const RESERVATION_MS = 10 * 60_000
/** Rows with `count > 0` and no report for this long are dropped (RQ-L2). */
export const STALE_ROW_MS = 12 * 60_000
/**
 * A room whose count fell to 0 (or that stopped reporting) may still hold state until its own GC
 * (at most 30 min, RQ-S15), which then calls `release`. Until then its id stays out of
 * `allocate`, so `/room/new` never hands out a room with a stale game in it (RQ-L3).
 */
export const EMPTY_ROOM_HOLD_MS = 31 * 60_000
/** At most one stats broadcast per this interval. */
export const BROADCAST_INTERVAL_MS = 1_000
/**
 * At most this many fresh reservations (allocated, never reported) at once. Without it an
 * unauthenticated flood of `POST /rooms` could hold every prime id for 10 minutes at a time.
 */
export const MAX_FRESH_RESERVATIONS = 500
/** Per client key: at most `ALLOCATE_PER_CLIENT` allocations per `ALLOCATE_WINDOW_MS`. */
export const ALLOCATE_WINDOW_MS = 60_000
export const ALLOCATE_PER_CLIENT = 20
/** Above this many tracked client keys, keys with no allocation in the window are dropped. */
const MAX_TRACKED_CLIENTS = 10_000

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

/** Too many fresh reservations are outstanding (`MAX_FRESH_RESERVATIONS`). */
export class LobbyBusyError extends Error {
  constructor() {
    super('too many pending room reservations')
  }
}

/** This client allocated `ALLOCATE_PER_CLIENT` ids within the window. */
export class LobbyRateLimitedError extends Error {
  constructor() {
    super('room creation rate limited')
  }
}

export type AllocateRefusal = 'full' | 'busy' | 'rate-limited'

/** The refusal reason for an error thrown by `allocate`, or null for anything else. */
export function allocateRefusal(e: unknown): AllocateRefusal | null {
  if (e instanceof LobbyFullError) {
    return 'full'
  }
  if (e instanceof LobbyBusyError) {
    return 'busy'
  }
  if (e instanceof LobbyRateLimitedError) {
    return 'rate-limited'
  }
  return null
}

export class LobbyCore {
  private lastBroadcastAt = Number.NEGATIVE_INFINITY
  private broadcastPending = false
  /** recent allocation times per client key (in memory: an eviction only resets the window) */
  private readonly recentByClient = new Map<string, number[]>()

  constructor(
    private readonly storage: LobbyStorage,
    private readonly sockets: () => LobbySocket[],
    private readonly clock: LobbyClock,
  ) {}

  /**
   * Smallest prime below 10^6 that is neither in use nor reserved, reserved for 10 min.
   * `client` (the caller's IP when known) is limited to `ALLOCATE_PER_CLIENT` per minute, and
   * no more than `MAX_FRESH_RESERVATIONS` unclaimed reservations exist at once.
   */
  allocate(client: string | null = null): string {
    const now = this.clock.now()
    this.takeClientSlot(client, now)
    const rows = this.purge(now)
    const busy = new Set<string>()
    let fresh = 0
    for (const row of rows) {
      if (row.count > 0 || (row.reservedUntil !== null && row.reservedUntil > now)) {
        busy.add(row.id)
      }
      if (row.count <= 0 && row.status === null && row.reservedUntil !== null) {
        fresh += 1
      }
    }
    if (fresh >= MAX_FRESH_RESERVATIONS) {
      throw new LobbyBusyError()
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
    if (count <= 0) {
      // keep the id held until the room's GC releases it
      this.storage.upsertRow({
        id,
        count: 0,
        status,
        reservedUntil: Math.max(prev?.reservedUntil ?? 0, now + EMPTY_ROOM_HOLD_MS),
        updatedAt: now,
      })
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
    const room: Record<string, number> = {}
    for (const row of this.purge(now)) {
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
    const before = this.storage.listRows().filter((r) => r.count > 0).length
    const after = this.purge(now).filter((r) => r.count > 0).length
    if (after !== before) {
      this.broadcastPending = true
    }
    if (this.broadcastPending && now - this.lastBroadcastAt >= BROADCAST_INTERVAL_MS) {
      this.broadcast(now)
    }
    this.scheduleAlarm(now)
  }

  /* ---------------------------------------------------------------- */

  private takeClientSlot(client: string | null, now: number): void {
    if (client === null) {
      return
    }
    const since = now - ALLOCATE_WINDOW_MS
    const recent = (this.recentByClient.get(client) ?? []).filter((t) => t > since)
    if (recent.length >= ALLOCATE_PER_CLIENT) {
      this.recentByClient.set(client, recent)
      throw new LobbyRateLimitedError()
    }
    recent.push(now)
    this.recentByClient.set(client, recent)
    if (this.recentByClient.size > MAX_TRACKED_CLIENTS) {
      for (const [key, times] of this.recentByClient) {
        if (times.every((t) => t <= since)) {
          this.recentByClient.delete(key)
        }
      }
    }
  }

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
   * Hide rooms that stopped reporting and drop rows whose reservation or hold lapsed.
   * Returns the rows that remain (one storage read).
   */
  private purge(now: number): LobbyRow[] {
    const kept: LobbyRow[] = []
    for (const row of this.storage.listRows()) {
      if (row.count > 0 && row.updatedAt + STALE_ROW_MS <= now) {
        // gone from the counters, but its id stays held in case the room still has state
        const held = {
          ...row,
          count: 0,
          reservedUntil: Math.max(row.reservedUntil ?? 0, now + EMPTY_ROOM_HOLD_MS),
        }
        this.storage.upsertRow(held)
        kept.push(held)
      } else if (row.count <= 0 && (row.reservedUntil === null || row.reservedUntil <= now)) {
        this.storage.deleteRow(row.id)
      } else {
        kept.push(row)
      }
    }
    return kept
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
