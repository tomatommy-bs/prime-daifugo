/**
 * The SQL storage classes against a real SQLite (`node:sqlite`) behind a minimal fake of the
 * Durable Object storage API (`sql.exec`, `transactionSync`, alarm calls, `deleteAll`).
 */
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { RoomState } from '../../src/session/types'
import { type EventRow, MemoryStorage, SqlHostStorage, SqlLobbyStorage } from '../src/storage'
import { freshState } from './fakes'

const SELECT_RE = /^\s*SELECT/i

function fakeDurableObjectStorage() {
  const db = new DatabaseSync(':memory:')
  const fake = {
    alarm: null as number | null,
    alarmCalls: [] as (number | null)[],
    sql: {
      exec(query: string, ...binds: (string | number | null)[]) {
        const stmt = db.prepare(query)
        if (!SELECT_RE.test(query)) {
          stmt.run(...binds)
          return { toArray: () => [] }
        }
        const rows = stmt.all(...binds)
        return { toArray: () => rows.map((r) => ({ ...(r as object) })) }
      },
    },
    transactionSync<T>(fn: () => T): T {
      db.exec('BEGIN')
      try {
        const out = fn()
        db.exec('COMMIT')
        return out
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    getAlarm: async () => fake.alarm,
    setAlarm: async (t: number) => {
      fake.alarm = t
      fake.alarmCalls.push(t)
    },
    deleteAlarm: async () => {
      fake.alarm = null
      fake.alarmCalls.push(null)
    },
    deleteAll: async () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string
      }[]
      for (const t of tables) {
        db.exec(`DROP TABLE ${t.name}`)
      }
    },
  }
  return fake
}

const asDo = (f: ReturnType<typeof fakeDurableObjectStorage>) =>
  f as unknown as DurableObjectStorage

const flush = () => new Promise((r) => setTimeout(r, 0))

function stateAt(version: number): RoomState {
  return { ...freshState(), version, ringFloor: Math.max(1, version - 63) }
}

function rows(from: number, to: number): EventRow[] {
  const out: EventRow[] = []
  for (let seq = from; seq <= to; seq += 1) {
    out.push({ seq, e: { type: 'presence' }, state: stateAt(seq) })
  }
  return out
}

describe('SqlHostStorage', () => {
  it('creates its tables, loads nothing, then round-trips the state row', async () => {
    const f = fakeDurableObjectStorage()
    const s = await SqlHostStorage.open(asDo(f))
    expect(s.loadState()).toBeNull()
    s.persist(stateAt(1), rows(1, 1), 1)
    s.persist(stateAt(2), rows(2, 2), 1)
    expect(s.loadState()).toEqual(stateAt(2))
    expect(s.readEvents(1)).toEqual(rows(1, 2))
    expect(s.readEvents(2)).toEqual(rows(2, 2))
    // a reopened object sees the same rows
    const again = await SqlHostStorage.open(asDo(f))
    expect(again.loadState()).toEqual(stateAt(2))
  })

  it('trims the ring below ringFloor in the same write', async () => {
    const s = await SqlHostStorage.open(asDo(fakeDurableObjectStorage()))
    s.persist(stateAt(70), rows(1, 70), 7)
    expect(s.readEvents(0).map((r) => r.seq)).toEqual(rows(7, 70).map((r) => r.seq))
  })

  it('rolls the whole write back if a statement fails', async () => {
    const s = await SqlHostStorage.open(asDo(fakeDurableObjectStorage()))
    s.persist(stateAt(1), rows(1, 1), 1)
    // the event row cannot be serialised, after the state row was already written
    const bad = { seq: 2, e: { type: 'presence' }, state: { ...stateAt(2), n: 1n } } as EventRow
    expect(() => s.persist(stateAt(2), [bad], 1)).toThrow()
    expect((s.loadState() as RoomState).version).toBe(1)
  })

  it('caches the alarm and forwards changes', async () => {
    const f = fakeDurableObjectStorage()
    f.alarm = 500
    const s = await SqlHostStorage.open(asDo(f))
    expect(s.getAlarm()).toBe(500)
    s.setAlarm(900)
    expect(s.getAlarm()).toBe(900)
    s.alarmFired()
    expect(s.getAlarm()).toBeNull()
    s.deleteAlarm()
    await flush()
    expect(f.alarmCalls).toEqual([900, null])
  })

  it('deleteAll wipes the rows and the alarm', async () => {
    const f = fakeDurableObjectStorage()
    const s = await SqlHostStorage.open(asDo(f))
    s.persist(stateAt(1), rows(1, 1), 1)
    s.setAlarm(1)
    s.deleteAll()
    await flush()
    expect(s.getAlarm()).toBeNull()
    expect(f.alarm).toBeNull()
    const reopened = await SqlHostStorage.open(asDo(f))
    expect(reopened.loadState()).toBeNull()
  })
})

describe('SqlLobbyStorage', () => {
  it('upserts, reads, lists and deletes rows', async () => {
    const s = await SqlLobbyStorage.open(asDo(fakeDurableObjectStorage()))
    expect(s.getRow('2')).toBeNull()
    s.upsertRow({ id: '2', count: 0, status: null, reservedUntil: 10, updatedAt: 1 })
    s.upsertRow({ id: '3', count: 2, status: 'playing', reservedUntil: null, updatedAt: 2 })
    s.upsertRow({ id: '2', count: 1, status: 'waiting', reservedUntil: 10, updatedAt: 3 })
    expect(s.getRow('2')).toEqual({
      id: '2',
      count: 1,
      status: 'waiting',
      reservedUntil: 10,
      updatedAt: 3,
    })
    expect(
      s
        .listRows()
        .map((r) => r.id)
        .sort(),
    ).toEqual(['2', '3'])
    s.deleteRow('2')
    expect(s.listRows().map((r) => r.id)).toEqual(['3'])
  })
})

describe('MemoryStorage', () => {
  it('mirrors the SQL semantics', () => {
    const s = new MemoryStorage()
    expect(s.loadState()).toBeNull()
    s.persist(stateAt(5), rows(1, 5), 3)
    expect(s.readEvents(0).map((r) => r.seq)).toEqual([3, 4, 5])
    s.setAlarm(9)
    s.alarmFired()
    expect(s.getAlarm()).toBeNull()
    s.deleteAll()
    expect(s.loadState()).toBeNull()
    expect(s.log).toEqual(['persist:5', 'setAlarm:9', 'deleteAll'])
  })
})
