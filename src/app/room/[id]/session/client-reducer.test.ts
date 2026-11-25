import type { Ack, RoomEvent, RoomServerFrame } from '@/shared/protocol'
import { frames, makeView } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import {
  type ClientState,
  clientReduce,
  closeReasonOf,
  initialClientState,
  onDisconnected,
} from './client-reducer'
import type { SessionTransition } from './types'

const drew = (by = 'p1'): RoomEvent => ({ type: 'drew', by })

/** Apply frames in order, collecting every transition and ack. */
function run(frameList: RoomServerFrame[], state: ClientState = initialClientState()) {
  let s = state
  const transitions: SessionTransition[] = []
  const acks: Ack[] = []
  for (const f of frameList) {
    const r = clientReduce(s, f)
    s = r.state
    transitions.push(...r.transitions)
    acks.push(...r.acks)
  }
  return { state: s, transitions, acks }
}

const evtAt = (seq: number, e: RoomEvent = drew(), game = {}) =>
  frames.evt(e, { snap: makeView({ version: seq, game: { turn: seq, ...game } }) })

describe('welcome', () => {
  it('snapshot applies the view without animation', () => {
    const { state, transitions } = run([frames.welcome({ snap: makeView({ version: 5 }) })])
    expect(state).toMatchObject({ selfId: 'p1', epoch: 'epoch-1', lastSeq: 5, welcomed: true })
    expect(state.game?.gameState.players.p1.hand).toEqual(['AS', '3H', 'JD'])
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({ prev: null, msg: { action: 'snapshot' }, event: null })
  })

  it('snapshot of a waiting room makes no transition (no game)', () => {
    const { state, transitions } = run([frames.welcome({ snap: makeView({ game: null }) })])
    expect(state.view?.status).toBe('waiting')
    expect(state.game).toBeNull()
    expect(transitions).toEqual([])
  })

  it('replay keeps the baseline and the following events animate', () => {
    const base = run([frames.welcome({ snap: makeView({ version: 3 }) })]).state
    const dropped = onDisconnected(base)
    expect(dropped.welcomed).toBe(false)
    const { state, transitions } = run(
      [frames.welcome({ mode: 'replay', seq: 5 }), evtAt(4), evtAt(5, { type: 'presence' })],
      dropped,
    )
    expect(state.lastSeq).toBe(5)
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({ msg: { action: 'draw' }, event: { type: 'drew' } })
    expect(transitions[0].prev).toEqual(base.game)
  })

  it('current changes nothing', () => {
    const base = run([frames.welcome({ snap: makeView({ version: 3 }) })]).state
    const r = clientReduce(onDisconnected(base), frames.welcome({ mode: 'current', seq: 3 }))
    expect(r.transitions).toEqual([])
    expect(r.state.view).toBe(base.view)
    expect(r.state.lastSeq).toBe(3)
    expect(r.state.welcomed).toBe(true)
  })

  it('current with no baseline in memory clears lastSeq so the next hello resyncs', () => {
    const r = clientReduce(
      initialClientState({ epoch: 'epoch-1', lastSeq: 9 }),
      frames.welcome({ mode: 'current', seq: 9 }),
    )
    expect(r.state.lastSeq).toBeNull()
    expect(r.state.view).toBeNull()
  })

  it('a changed epoch in replay/current drops the baseline; the next event is a snapshot', () => {
    const base = run([frames.welcome({ snap: makeView({ version: 30 }) })]).state
    const r = clientReduce(base, frames.welcome({ mode: 'replay', seq: 2, epoch: 'epoch-2' }))
    expect(r.state).toMatchObject({ epoch: 'epoch-2', lastSeq: null, view: null, game: null })
    const next = clientReduce(r.state, evtAt(2))
    expect(next.transitions[0]).toMatchObject({ msg: { action: 'snapshot' }, event: null })
    expect(next.state.lastSeq).toBe(2)
  })

  it('a changed epoch with a snapshot replaces the view even with a lower seq', () => {
    const base = run([frames.welcome({ snap: makeView({ version: 30 }) })]).state
    const { state, transitions } = run(
      [frames.welcome({ epoch: 'epoch-2', snap: makeView({ version: 1 }) }), evtAt(2)],
      base,
    )
    expect(state).toMatchObject({ epoch: 'epoch-2', lastSeq: 2 })
    expect(transitions.map((t) => t.msg)).toEqual([{ action: 'snapshot' }, expect.anything()])
    expect(transitions[1].event).toEqual(drew())
  })

  it('a snapshot welcome without snap drops the baseline', () => {
    const malformed = { ...frames.welcome({ mode: 'current' }), mode: 'snapshot' as const }
    const r = clientReduce(initialClientState(), malformed)
    expect(r.state.lastSeq).toBeNull()
    expect(r.transitions).toEqual([])
  })

  it('replay after a reload (no baseline) catches up without animation', () => {
    const resumed = initialClientState({ epoch: 'epoch-1', lastSeq: 3 })
    const { state, transitions } = run(
      [frames.welcome({ mode: 'replay', seq: 6 }), evtAt(4), evtAt(5), evtAt(6), evtAt(7)],
      resumed,
    )
    expect(transitions.map((t) => t.msg.action)).toEqual([
      'snapshot',
      'snapshot',
      'snapshot',
      'draw',
    ])
    expect(transitions.slice(0, 3).every((t) => t.event === null)).toBe(true)
    expect(state).toMatchObject({ lastSeq: 7, catchUpTo: null })
  })

  it('clears a previous bye', () => {
    const closed = run([frames.welcome(), frames.bye('superseded')]).state
    expect(closed.closeReason).toBe('superseded')
    const r = clientReduce(closed, frames.welcome())
    expect(r.state).toMatchObject({ bye: null, closeReason: null })
  })
})

describe('evt sequencing (spec §6.4)', () => {
  const base = () => run([frames.welcome({ snap: makeView({ version: 3 }) })]).state

  it('seq === lastSeq + 1 animates with prev and next', () => {
    const r = clientReduce(base(), evtAt(4, drew('p2')))
    expect(r.state.lastSeq).toBe(4)
    expect(r.transitions).toHaveLength(1)
    expect(r.transitions[0]).toMatchObject({
      msg: { action: 'draw', commander: { id: 'p2', name: 'player2' } },
      event: drew('p2'),
    })
    expect(r.transitions[0].next.ctx.turn).toBe(4)
  })

  it('a duplicate or old seq is ignored', () => {
    const s = clientReduce(base(), evtAt(4)).state
    for (const seq of [4, 3, 1]) {
      const r = clientReduce(s, evtAt(seq))
      expect(r.state).toBe(s)
      expect(r.transitions).toEqual([])
    }
  })

  it('a gap applies the snap as a snapshot without animation', () => {
    const r = clientReduce(base(), evtAt(7))
    expect(r.state.lastSeq).toBe(7)
    expect(r.transitions).toHaveLength(1)
    expect(r.transitions[0]).toMatchObject({ msg: { action: 'snapshot' }, event: null })
    expect(r.transitions[0].next.ctx.turn).toBe(7)
  })

  it('an event before any welcome is applied as a snapshot', () => {
    const r = clientReduce(initialClientState(), evtAt(2))
    expect(r.transitions[0].msg).toEqual({ action: 'snapshot' })
  })

  it('presence-only events update the view but make no transition', () => {
    for (const e of [
      { type: 'presence' },
      { type: 'ready-changed', by: 'p1', ready: false },
      { type: 'member-left', pid: 'p2', name: 'bob' },
    ] as RoomEvent[]) {
      const r = clientReduce(base(), evtAt(4, e))
      expect(r.transitions).toEqual([])
      expect(r.state.view?.version).toBe(4)
    }
  })

  it('forfeited emits a snapshot-type transition carrying the event', () => {
    const e: RoomEvent = { type: 'forfeited', pid: 'p2', reason: 'grace' }
    const r = clientReduce(base(), evtAt(4, e))
    expect(r.transitions).toHaveLength(1)
    expect(r.transitions[0]).toMatchObject({ msg: { action: 'snapshot' }, event: e })
  })

  it('rule-changed emits change-rule', () => {
    const rule = { initNumCards: 4, maxSubmitNumCards: 52, timeLimit: 15, halfEvenNumbers: true }
    const r = clientReduce(base(), evtAt(4, { type: 'rule-changed', by: 'p2', rule }))
    expect(r.transitions[0].msg).toEqual({ action: 'change-rule', rule, by: 'p2' })
  })

  it('an event whose post-state has no game makes no transition', () => {
    const r = clientReduce(
      base(),
      frames.evt(
        { type: 'member-left', pid: 'p2', name: 'b' },
        { snap: makeView({ version: 4, game: null }) },
      ),
    )
    expect(r.transitions).toEqual([])
    expect(r.state.game).toBeNull()
  })

  it('a winning submit then game-ended animate in order with their own seq', () => {
    const final = makeView({
      status: 'waitingNextRound',
      game: { winner: { id: 'p1', name: 'player1' } },
    })
    const { transitions } = run(
      [
        frames.evt(
          {
            type: 'submitted',
            by: 'p1',
            submit: ['AS'],
            factor: [],
            result: null,
            cut57: false,
            flowed: false,
            penalty: 0,
          },
          { seq: 4, snap: { ...final, version: 5 } },
        ),
        frames.evt(
          { type: 'game-ended', winnerId: 'p1', winnerName: 'player1', reason: 'empty-hand' },
          { seq: 5, snap: { ...final, version: 5 } },
        ),
      ],
      base(),
    )
    expect(transitions.map((t) => t.msg.action)).toEqual(['submit', 'game-end'])
    expect(transitions[1].next.gameState.winner).toBe('p1')
  })
})

describe('ack and bye', () => {
  it('returns acks without changing state', () => {
    const s = initialClientState()
    const ok = clientReduce(s, frames.ack('a1', { seq: 3 }))
    expect(ok.state).toBe(s)
    expect(ok.acks).toEqual([{ t: 'ack', id: 'a1', ok: true, seq: 3 }])
    const ng = clientReduce(s, frames.ack('a2', { reason: 'stale' }))
    expect(ng.acks).toEqual([{ t: 'ack', id: 'a2', ok: false, reason: 'stale' }])
  })

  it.each([
    ['superseded', 'superseded'],
    ['left', 'left'],
    ['room-full', 'room-full'],
    ['bad-name', 'bad-name'],
    ['upgrade-required', 'upgrade-required'],
    ['room-gone', 'room-gone'],
    ['protocol', null],
  ] as const)('bye %s → closeReason %s', (reason, expected) => {
    const r = clientReduce(initialClientState(), frames.bye(reason))
    expect(r.state.bye).toBe(reason)
    expect(r.state.closeReason).toBe(expected)
    expect(closeReasonOf(reason)).toBe(expected)
  })

  it('ignores unknown frame types', () => {
    const s = initialClientState()
    const r = clientReduce(s, { t: 'nope' } as unknown as RoomServerFrame)
    expect(r.state).toBe(s)
  })

  it('onDisconnected keeps the state object when not welcomed', () => {
    const s = initialClientState()
    expect(onDisconnected(s)).toBe(s)
  })
})
