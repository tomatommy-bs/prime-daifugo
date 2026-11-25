import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM_CONFIG } from '../../src/session/types'
import { parseAllowedOrigins, parseRoomConfig } from '../src/config'
import { type Env, lobbyStub, roomStub } from '../src/env'

describe('parseRoomConfig', () => {
  it('uses the defaults when no vars are set', () => {
    expect(parseRoomConfig({})).toEqual(DEFAULT_ROOM_CONFIG)
  })

  it('reads the five duration vars', () => {
    const c = parseRoomConfig({
      GRACE_PLAYING_MS: '1500',
      GRACE_IDLE_MS: ' 1500 ',
      AWAY_TURN_CAP_MS: '1000',
      ROOM_TTL_IDLE_MS: '5000',
      ROOM_TTL_ACTIVE_MS: '9000',
    })
    expect(c).toMatchObject({
      gracePlayingMs: 1500,
      graceIdleMs: 1500,
      awayTurnCapMs: 1000,
      roomTtlIdleMs: 5000,
      roomTtlActiveMs: 9000,
      maxSeats: 4,
      maxObservers: 8,
    })
  })

  it('ignores malformed, zero, negative and unsafe values', () => {
    for (const bad of ['', 'abc', '0', '-5', '1.5', '1e3', '99999999999999999999']) {
      expect(parseRoomConfig({ GRACE_PLAYING_MS: bad }).gracePlayingMs).toBe(
        DEFAULT_ROOM_CONFIG.gracePlayingMs,
      )
    }
  })
})

describe('parseAllowedOrigins', () => {
  it('splits, trims, drops empties and trailing slashes', () => {
    expect(parseAllowedOrigins(' http://a.test , https://b.test/,, ')).toEqual([
      'http://a.test',
      'https://b.test',
    ])
    expect(parseAllowedOrigins(undefined)).toEqual([])
    expect(parseAllowedOrigins('')).toEqual([])
  })
})

describe('Durable Object stubs', () => {
  it('address the lobby by name and rooms by id, with the apac location hint', () => {
    const ns = (kind: string) => ({
      idFromName: (name: string) => `${kind}:${name}`,
      get: (id: string, opts: unknown) => ({ id, opts }),
    })
    const env = { ROOM: ns('room'), LOBBY: ns('lobby') } as unknown as Env
    expect(lobbyStub(env)).toEqual({ id: 'lobby:lobby', opts: { locationHint: 'apac' } })
    expect(roomStub(env, '1009')).toEqual({ id: 'room:1009', opts: { locationHint: 'apac' } })
  })
})
