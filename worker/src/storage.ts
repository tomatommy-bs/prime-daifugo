import type { RoomState } from '../../src/session/types'
/**
 * Storage for the pure hosts (spec §4.2, §4.4): interfaces, the Durable Object SQLite
 * implementations and in-memory implementations for tests. No `cloudflare:*` imports; the SQL
 * implementations only use the ambient `DurableObjectStorage` type.
 */
import type { RoomEvent } from '../../src/shared/protocol'

/** One ring row: the event and the unredacted post-state it was emitted with (spec §4.2). */
export type EventRow = { seq: number; e: RoomEvent; state: RoomState }

/** One-alarm-per-object scheduling, with the current alarm cached so changes can be compared. */
export interface AlarmStorage {
  getAlarm(): number | null
  setAlarm(at: number): void
  deleteAlarm(): void
  /** The runtime cleared the alarm by firing it. */
  alarmFired(): void
}

export interface HostStorage extends AlarmStorage {
  /** The stored state row parsed as JSON, or null. The host checks `schema`. */
  loadState(): unknown
  /**
   * The write path for one accepted input (spec §4.2), atomically: upsert the state row, insert
   * the events, delete ring rows with `seq < ringFloor`.
   */
  persist(state: RoomState, events: readonly EventRow[], ringFloor: number): void
  /** Ring rows with `seq >= fromSeq`, ascending. */
  readEvents(fromSeq: number): EventRow[]
  /** Wipe everything (room GC). */
  deleteAll(): void
}

export type LobbyRow = {
  id: string
  count: number
  status: string | null
  reservedUntil: number | null
  updatedAt: number
}

export interface LobbyStorage extends AlarmStorage {
  listRows(): LobbyRow[]
  getRow(id: string): LobbyRow | null
  upsertRow(row: LobbyRow): void
  deleteRow(id: string): void
}

/* ------------------------------------------------------------------ */
/* Durable Object SQLite                                               */
/* ------------------------------------------------------------------ */

abstract class DurableObjectAlarm implements AlarmStorage {
  protected alarm: number | null = null

  constructor(protected readonly storage: DurableObjectStorage) {}

  /** Read the current alarm once (inside `blockConcurrencyWhile`). */
  async loadAlarm(): Promise<void> {
    this.alarm = await this.storage.getAlarm()
  }

  getAlarm(): number | null {
    return this.alarm
  }

  setAlarm(at: number): void {
    this.alarm = at
    // Not awaited: storage operations are ordered and the output gate holds outgoing
    // messages until they are durable (spec §4.2).
    void this.storage.setAlarm(at)
  }

  deleteAlarm(): void {
    this.alarm = null
    void this.storage.deleteAlarm()
  }

  alarmFired(): void {
    this.alarm = null
  }
}

export class SqlHostStorage extends DurableObjectAlarm implements HostStorage {
  static async open(storage: DurableObjectStorage): Promise<SqlHostStorage> {
    const s = new SqlHostStorage(storage)
    s.createTables()
    await s.loadAlarm()
    return s
  }

  private createTables(): void {
    this.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, json TEXT NOT NULL)',
    )
    this.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, json TEXT NOT NULL)',
    )
  }

  loadState(): unknown {
    const rows = this.storage.sql
      .exec<{ json: string }>('SELECT json FROM room_state WHERE id = 1')
      .toArray()
    return rows.length > 0 ? JSON.parse(rows[0].json) : null
  }

  persist(state: RoomState, events: readonly EventRow[], ringFloor: number): void {
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        'INSERT INTO room_state (id, version, json) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version, json = excluded.json',
        state.version,
        JSON.stringify(state),
      )
      for (const row of events) {
        this.storage.sql.exec(
          'INSERT OR REPLACE INTO events (seq, json) VALUES (?, ?)',
          row.seq,
          JSON.stringify({ e: row.e, state: row.state }),
        )
      }
      this.storage.sql.exec('DELETE FROM events WHERE seq < ?', ringFloor)
    })
  }

  readEvents(fromSeq: number): EventRow[] {
    return this.storage.sql
      .exec<{ seq: number; json: string }>(
        'SELECT seq, json FROM events WHERE seq >= ? ORDER BY seq',
        fromSeq,
      )
      .toArray()
      .map((r) => {
        const parsed = JSON.parse(r.json) as { e: RoomEvent; state: RoomState }
        return { seq: r.seq, e: parsed.e, state: parsed.state }
      })
  }

  /**
   * Wipe the rows, not the database: `storage.deleteAll()` on a SQLite-backed object also drops
   * the tables, and the same instance keeps serving the room id after GC (spec §4.4), so its next
   * write would fail with "no such table".
   */
  deleteAll(): void {
    this.alarm = null
    void this.storage.deleteAlarm()
    this.storage.transactionSync(() => {
      this.storage.sql.exec('DELETE FROM room_state')
      this.storage.sql.exec('DELETE FROM events')
    })
  }
}

type SqlLobbyRow = {
  id: string
  count: number
  status: string | null
  reserved_until: number | null
  updated_at: number
}

function fromSqlRow(r: SqlLobbyRow): LobbyRow {
  return {
    id: r.id,
    count: r.count,
    status: r.status,
    reservedUntil: r.reserved_until,
    updatedAt: r.updated_at,
  }
}

export class SqlLobbyStorage extends DurableObjectAlarm implements LobbyStorage {
  static async open(storage: DurableObjectStorage): Promise<SqlLobbyStorage> {
    const s = new SqlLobbyStorage(storage)
    s.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, count INTEGER NOT NULL, status TEXT, reserved_until INTEGER, updated_at INTEGER NOT NULL)',
    )
    await s.loadAlarm()
    return s
  }

  listRows(): LobbyRow[] {
    return this.storage.sql.exec<SqlLobbyRow>('SELECT * FROM rooms').toArray().map(fromSqlRow)
  }

  getRow(id: string): LobbyRow | null {
    const rows = this.storage.sql
      .exec<SqlLobbyRow>('SELECT * FROM rooms WHERE id = ?', id)
      .toArray()
    return rows.length > 0 ? fromSqlRow(rows[0]) : null
  }

  upsertRow(row: LobbyRow): void {
    this.storage.sql.exec(
      'INSERT INTO rooms (id, count, status, reserved_until, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET count = excluded.count, status = excluded.status, reserved_until = excluded.reserved_until, updated_at = excluded.updated_at',
      row.id,
      row.count,
      row.status,
      row.reservedUntil,
      row.updatedAt,
    )
  }

  deleteRow(id: string): void {
    this.storage.sql.exec('DELETE FROM rooms WHERE id = ?', id)
  }
}

/* ------------------------------------------------------------------ */
/* In-memory (tests)                                                   */
/* ------------------------------------------------------------------ */

class MemoryAlarm implements AlarmStorage {
  alarm: number | null = null
  /** every alarm change, for "set only when different" assertions */
  readonly alarmOps: (number | null)[] = []

  constructor(readonly log: string[] = []) {}

  getAlarm(): number | null {
    return this.alarm
  }

  setAlarm(at: number): void {
    this.alarm = at
    this.alarmOps.push(at)
    this.log.push(`setAlarm:${at}`)
  }

  deleteAlarm(): void {
    this.alarm = null
    this.alarmOps.push(null)
    this.log.push('deleteAlarm')
  }

  alarmFired(): void {
    this.alarm = null
  }
}

/** In-memory `HostStorage`. Values round-trip through JSON like the SQL rows. `log` records ops. */
export class MemoryStorage extends MemoryAlarm implements HostStorage {
  stateJson: string | null = null
  readonly events = new Map<number, string>()

  loadState(): unknown {
    return this.stateJson === null ? null : JSON.parse(this.stateJson)
  }

  persist(state: RoomState, events: readonly EventRow[], ringFloor: number): void {
    this.stateJson = JSON.stringify(state)
    this.log.push(`persist:${state.version}`)
    for (const row of events) {
      this.events.set(row.seq, JSON.stringify(row))
    }
    for (const seq of [...this.events.keys()]) {
      if (seq < ringFloor) {
        this.events.delete(seq)
      }
    }
  }

  readEvents(fromSeq: number): EventRow[] {
    return [...this.events.entries()]
      .filter(([seq]) => seq >= fromSeq)
      .sort((a, b) => a[0] - b[0])
      .map(([, json]) => JSON.parse(json) as EventRow)
  }

  deleteAll(): void {
    this.stateJson = null
    this.events.clear()
    this.alarm = null
    this.log.push('deleteAll')
  }
}

/** In-memory `LobbyStorage`. */
export class MemoryLobbyStorage extends MemoryAlarm implements LobbyStorage {
  readonly rows = new Map<string, LobbyRow>()

  listRows(): LobbyRow[] {
    return [...this.rows.values()].map((r) => ({ ...r }))
  }

  getRow(id: string): LobbyRow | null {
    const row = this.rows.get(id)
    return row ? { ...row } : null
  }

  upsertRow(row: LobbyRow): void {
    this.rows.set(row.id, { ...row })
  }

  deleteRow(id: string): void {
    this.rows.delete(id)
  }
}
