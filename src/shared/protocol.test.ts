import { describe, expect, it } from 'vitest'
import {
  CARD_IDS,
  CLOSE,
  PV,
  ROOM_ID_RE,
  SID_RE,
  TERMINAL_CLOSE_CODES,
  base64url,
  generateEpoch,
  generateSid,
  isValidRoomId,
  isValidSid,
} from './ids'
import {
  BYE_CLOSE_CODE,
  ByeReasonSchema,
  CmdSchema,
  MAX_FRAME_BYTES,
  type RoomEvent,
  RoomEventSchema,
  type View,
  ViewSchema,
  parseClientFrame,
  parseServerFrame,
  utf8Length,
} from './protocol'

const SID = 'a'.repeat(43)
const EPOCH_RE = /^[A-Za-z0-9_-]{16}$/

const hello = {
  t: 'hello',
  pv: PV,
  sid: SID,
  name: 'alice',
  lastSeq: null,
  epoch: null,
}

const view: View = {
  roomId: '1009',
  status: 'playing',
  rule: { initNumCards: 11, maxSubmitNumCards: 4, timeLimit: 60, halfEvenNumbers: false },
  version: 7,
  members: [
    { id: 'pidAlice00000000', name: 'alice', ready: true, role: 'player', connected: true },
    { id: 'pidBob0000000000', name: 'bob', ready: true, role: 'player', connected: false },
  ],
  game: {
    round: 1,
    turn: 3,
    playOrder: ['pidAlice00000000', 'pidBob0000000000'],
    currentPlayer: 'pidBob0000000000',
    players: {
      pidAlice00000000: { handCount: 2, drawRight: true },
      pidBob0000000000: { handCount: 11, drawRight: false },
    },
    hand: ['AS', '10H'],
    field: [['QS', 'AH']],
    deckCount: 30,
    deckTopPlayer: 'pidAlice00000000',
    deadline: 1_700_000_000_000,
    winner: null,
    lastResult: null,
  },
}

const json = (v: unknown) => JSON.stringify(v)
const cmd = (c: unknown, id = 'r1') => json({ t: 'cmd', id, c })

describe('ids', () => {
  it('generates 43-char base64url sids', () => {
    const sid = generateSid()
    expect(sid).toMatch(SID_RE)
    expect(isValidSid(sid)).toBe(true)
    expect(generateSid()).not.toBe(sid)
  })

  it('generates url-safe epochs', () => {
    expect(generateEpoch()).toMatch(EPOCH_RE)
  })

  it('encodes base64url without padding', () => {
    const enc = (s: string) => base64url(new TextEncoder().encode(s))
    expect(enc('')).toBe('')
    expect(enc('f')).toBe('Zg')
    expect(enc('fo')).toBe('Zm8')
    expect(enc('foo')).toBe('Zm9v')
    expect(enc('foob')).toBe('Zm9vYg')
    expect(base64url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-')
  })

  it.each([
    ['a', true],
    ['1009', true],
    ['A-z_0', true],
    ['x'.repeat(32), true],
    ['x'.repeat(33), false],
    ['', false],
    ['a/b', false],
    ['a b', false],
  ])('room id %j valid=%s', (id, ok) => {
    expect(ROOM_ID_RE.test(id)).toBe(ok)
    expect(isValidRoomId(id)).toBe(ok)
  })

  it('rejects malformed sids', () => {
    expect(isValidSid('a'.repeat(42))).toBe(false)
    expect(isValidSid(`${'a'.repeat(42)}=`)).toBe(false)
    expect(isValidSid(undefined)).toBe(false)
  })

  it('lists 52 distinct cards', () => {
    expect(new Set(CARD_IDS).size).toBe(52)
  })

  it('maps every bye reason to its close code', () => {
    for (const reason of ByeReasonSchema.options) {
      expect(TERMINAL_CLOSE_CODES).toContain(BYE_CLOSE_CODE[reason])
    }
    expect(CLOSE).toEqual({
      left: 4000,
      superseded: 4001,
      'room-full': 4002,
      'bad-name': 4003,
      protocol: 4004,
      'upgrade-required': 4005,
      'room-gone': 4006,
    })
  })
})

describe('parseClientFrame', () => {
  it('accepts a hello', () => {
    expect(parseClientFrame(json(hello))).toEqual({ ok: true, frame: hello })
    const resume = { ...hello, lastSeq: 12, epoch: 'ep0' }
    expect(parseClientFrame(json(resume))).toEqual({ ok: true, frame: resume })
  })

  it.each([
    ['bad sid', { ...hello, sid: 'short' }],
    ['missing lastSeq', { ...hello, lastSeq: undefined }],
    ['negative lastSeq', { ...hello, lastSeq: -1 }],
    ['fractional pv', { ...hello, pv: 1.5 }],
    ['oversize name', { ...hello, name: 'x'.repeat(65) }],
  ])('rejects a hello with %s', (_label, frame) => {
    expect(parseClientFrame(json(frame))).toEqual({ ok: false, error: 'schema' })
  })

  it.each([
    [{ type: 'ready' }],
    [{ type: 'unready' }],
    [{ type: 'set-rule', rule: { timeLimit: 15 } }],
    [{ type: 'set-rule', rule: {} }],
    [{ type: 'start', expectedVersion: 4 }],
    [{ type: 'draw', turn: 0 }],
    [{ type: 'pass', turn: 3 }],
    [{ type: 'submit', turn: 3, submit: ['QS', 'AH'], factor: [] }],
    [{ type: 'submit', turn: 3, submit: ['5S', '7H'], factor: ['3C', '*', '5D', '^', '2H'] }],
    [{ type: 'leave' }],
  ])('accepts command %j', (c) => {
    const result = parseClientFrame(cmd(c))
    expect(result).toEqual({ ok: true, frame: { t: 'cmd', id: 'r1', c } })
  })

  it.each([
    ['unknown type', { type: 'chat', message: 'hi' }],
    ['bad card id', { type: 'submit', turn: 0, submit: ['1S'], factor: [] }],
    ['joker', { type: 'submit', turn: 0, submit: ['JOKER'], factor: [] }],
    ['bad factor token', { type: 'submit', turn: 0, submit: ['2S'], factor: ['+'] }],
    ['oversize submit', { type: 'submit', turn: 0, submit: new Array(53).fill('AS'), factor: [] }],
    [
      'oversize factor',
      { type: 'submit', turn: 0, submit: ['AS'], factor: new Array(65).fill('*') },
    ],
    ['missing turn', { type: 'pass' }],
    ['negative turn', { type: 'draw', turn: -1 }],
    ['missing expectedVersion', { type: 'start' }],
    ['unknown rule key', { type: 'set-rule', rule: { leftTime: 3 } }],
    ['string rule value', { type: 'set-rule', rule: { timeLimit: '60' } }],
  ])('rejects a command with %s', (_label, c) => {
    expect(parseClientFrame(cmd(c))).toEqual({ ok: false, error: 'schema' })
  })

  it('accepts the maximum sizes', () => {
    const c = {
      type: 'submit',
      turn: 0,
      submit: new Array(52).fill('AS'),
      factor: new Array(64).fill('*'),
    }
    expect(parseClientFrame(cmd(c)).ok).toBe(true)
  })

  it.each([
    ['empty id', ''],
    ['id over 32 chars', 'x'.repeat(33)],
  ])('rejects a command frame with %s', (_label, id) => {
    expect(parseClientFrame(cmd({ type: 'ready' }, id))).toEqual({ ok: false, error: 'schema' })
  })

  it('rejects unknown frame kinds and non-JSON', () => {
    expect(parseClientFrame(json({ t: 'nope' }))).toEqual({ ok: false, error: 'schema' })
    expect(parseClientFrame('ping')).toEqual({ ok: false, error: 'not-json' })
    expect(parseClientFrame('{')).toEqual({ ok: false, error: 'not-json' })
  })

  it('rejects frames over 8 KB before parsing', () => {
    const big = json({ ...hello, name: 'x'.repeat(MAX_FRAME_BYTES) })
    expect(parseClientFrame(big)).toEqual({ ok: false, error: 'too-large' })
    // under 8192 UTF-16 units but over 8192 UTF-8 bytes
    const multibyte = json({ ...hello, name: 'あ'.repeat(3000) })
    expect(multibyte.length).toBeLessThan(MAX_FRAME_BYTES)
    expect(parseClientFrame(multibyte)).toEqual({ ok: false, error: 'too-large' })
  })
})

describe('utf8Length', () => {
  it('counts UTF-8 bytes', () => {
    for (const s of ['', 'abc', 'é', 'あいう', '😀', 'a😀b', '\uD800', '\uD800x', '\uDC00']) {
      expect(utf8Length(s)).toBe(new TextEncoder().encode(s).length)
    }
  })
})

const events: RoomEvent[] = [
  { type: 'presence' },
  { type: 'ready-changed', by: 'p1', ready: true },
  { type: 'rule-changed', by: 'p1', rule: view.rule },
  { type: 'game-started', by: 'p1', round: 1 },
  { type: 'drew', by: 'p1' },
  { type: 'passed', by: 'p1', reason: 'timeout', flowed: true },
  {
    type: 'submitted',
    by: 'p1',
    submit: ['5S', '7H'],
    factor: ['3C', '*', '5D', '^', '2H'],
    result: 'INCORRECT_ANSWER',
    cut57: false,
    flowed: false,
    penalty: 5,
  },
  { type: 'forfeited', pid: 'p2', reason: 'grace' },
  { type: 'game-ended', winnerId: 'p1', winnerName: 'alice', reason: 'last-standing' },
  { type: 'member-left', pid: 'p2', name: 'bob' },
]

describe('parseServerFrame', () => {
  it.each<[unknown]>([
    [
      {
        t: 'welcome',
        pv: 1,
        selfId: 'p1',
        epoch: 'e',
        serverNow: 1,
        mode: 'snapshot',
        seq: 7,
        snap: view,
      },
    ],
    [{ t: 'welcome', pv: 1, selfId: 'p1', epoch: 'e', serverNow: 1, mode: 'current', seq: 7 }],
    [{ t: 'ack', id: 'r1', ok: true, seq: 8 }],
    [{ t: 'ack', id: 'r1', ok: false, reason: 'stale' }],
    [{ t: 'bye', reason: 'superseded' }],
    [{ t: 'lobby', lobby: 3, room: { '1009': 2 } }],
    ...events.map((e, i): [unknown] => [{ t: 'evt', seq: i + 1, serverNow: 5, e, snap: view }]),
  ])('round-trips %j', (frame) => {
    expect(parseServerFrame(json(frame))).toEqual({ ok: true, frame })
  })

  it('round-trips a waiting-room view without a game', () => {
    const waiting: View = { ...view, status: 'waiting', game: null }
    expect(ViewSchema.parse(JSON.parse(json(waiting)))).toEqual(waiting)
  })

  it.each([
    ['unknown event', { t: 'evt', seq: 1, serverNow: 1, e: { type: 'chat' }, snap: view }],
    ['evt without snap', { t: 'evt', seq: 1, serverNow: 1, e: { type: 'presence' } }],
    [
      'bad hand card',
      {
        t: 'evt',
        seq: 1,
        serverNow: 1,
        e: { type: 'presence' },
        snap: { ...view, game: { ...view.game, hand: ['ZZ'] } },
      },
    ],
    ['unknown reject reason', { t: 'ack', id: 'r1', ok: false, reason: 'nope' }],
    ['ok ack without seq', { t: 'ack', id: 'r1', ok: true }],
    ['unknown bye reason', { t: 'bye', reason: 'kicked' }],
    [
      'bad welcome mode',
      { t: 'welcome', pv: 1, selfId: 'p1', epoch: 'e', serverNow: 1, mode: 'full', seq: 0 },
    ],
    ['negative lobby count', { t: 'lobby', lobby: -1, room: {} }],
  ])('rejects %s', (_label, frame) => {
    expect(parseServerFrame(json(frame))).toEqual({ ok: false, error: 'schema' })
  })

  it('rejects non-JSON', () => {
    expect(parseServerFrame('pong')).toEqual({ ok: false, error: 'not-json' })
  })
})

describe('schemas', () => {
  it('covers every event type', () => {
    expect(new Set(events.map((e) => e.type)).size).toBe(RoomEventSchema.options.length)
  })

  it('covers every command type', () => {
    expect(CmdSchema.options.map((o) => o.shape.type.value).sort()).toEqual(
      ['draw', 'leave', 'pass', 'ready', 'set-rule', 'start', 'submit', 'unready'].sort(),
    )
  })
})
