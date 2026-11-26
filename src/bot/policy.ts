/**
 * Bot players: one turn decision from the engine state, at three levels.
 *
 * - `weak`: a random prime play; sometimes overlooks a play, and sometimes submits a composite
 *   that looks prime (odd, not ending in 5, digit sum not a multiple of 3) and takes the penalty.
 * - `normal`: greedy. Shed as many cards as possible, cut with 57, beat the field with the lowest
 *   number that works (the highest when an opponent is about to go out), and keep a hand that can
 *   still make small primes.
 * - `strong`: the `normal` shortlist, each candidate scored by Monte Carlo playouts over
 *   determinized deals (the hidden hands are re-dealt from the cards this seat cannot see).
 *
 * A bot only reads what its seat could see: its own hand, the field, the hand counts, the deck
 * size. The hidden cards are touched only to re-deal them at random in `strong`.
 * Runtime imports are relative only (spec §15): this module runs inside the Worker.
 */
import { cardValue } from '../game/cards'
import { engine } from '../game/engine'
import type { CardId, FactCardId, GameCore, Move, Pid, Rng } from '../game/types'
import { BOT_LEVELS, type BotLevel } from '../shared/bot'
import { mulberry32, randomInt, shuffle } from '../shared/rng'
import { type PlayContext, type RankPlay, compositePlays, primePlays, toCards } from './moves'
import {
  MAX_BOT_CARDS,
  fits,
  giveRanks,
  rankCounts,
  rankTables,
  spell,
  strength,
  takeRanks,
} from './ranks'

export { BOT_LEVELS, type BotLevel }

export type BotAction =
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'submit'; submit: CardId[]; factor: FactCardId[] }

/** `weak`: chance to submit a prime-looking composite when one is at hand. */
export const WEAK_BLUNDER_RATE = 0.1
/** `weak`: chance to overlook every play and draw or pass instead. */
export const WEAK_OVERLOOK_RATE = 0.25
/** `strong`: shortlist size, determinized deals per decision, playout length in moves. */
export const STRONG_SHORTLIST = 6
export const STRONG_DEALS = 8
export const STRONG_PLAYOUT_MOVES = 48

type Seat = {
  ctx: PlayContext
  canDraw: boolean
  /** fewest cards held by an opponent */
  oppMin: number
}

function seatOf(core: GameCore, pid: Pid): Seat {
  const me = core.players[pid]
  const opponents = core.playOrder.filter((p) => p !== pid).map((p) => core.players[p].hand.length)
  return {
    ctx: {
      hand: me.hand,
      top: core.field.at(-1) ?? null,
      maxSubmitNumCards: core.rule.maxSubmitNumCards,
    },
    canDraw: me.drawRight && core.deck.length > 0,
    oppMin: opponents.length > 0 ? Math.min(...opponents) : Number.POSITIVE_INFINITY,
  }
}

const noPlay = (seat: Seat): BotAction => (seat.canDraw ? { type: 'draw' } : { type: 'pass' })

const submitOf = (hand: readonly CardId[], play: RankPlay): BotAction => ({
  type: 'submit',
  ...toCards(hand, play),
})

/** Distinct 1- and 2-card playable values left in `counts` (capped): can the hand still play? */
function potential(counts: number[]): number {
  const { playable } = rankTables()
  const seen = new Set<number>()
  for (const k of [1, 2]) {
    for (const { ranks, value } of playable[k]) {
      if (!seen.has(value) && fits(counts, ranks)) {
        seen.add(value)
        if (seen.size >= 12) {
          return seen.size
        }
      }
    }
  }
  return seen.size
}

/** The greedy evaluation of one play (higher is better). */
export function scorePlay(seat: Seat, counts: number[], play: RankPlay): number {
  if (play.shed >= seat.ctx.hand.length) {
    return 1e6
  }
  let score = 10 * play.shed
  if (play.cut57) {
    score += 15
  }
  const factorRanks = play.factor.filter((t): t is number => typeof t === 'number')
  takeRanks(counts, play.ranks)
  takeRanks(counts, factorRanks)
  score += 1.5 * potential(counts)
  giveRanks(counts, factorRanks)
  giveRanks(counts, play.ranks)
  if (seat.ctx.top !== null) {
    // beat the field cheaply, unless an opponent is about to go out
    const s = strength(play.value, play.ranks.length)
    score += seat.oppMin <= 2 ? 6 * s : -6 * s
  }
  return score
}

/** Every play, best first, by the greedy evaluation. */
function rankedPlays(seat: Seat, withComposites: boolean): RankPlay[] {
  const counts = rankCounts(seat.ctx.hand)
  const plays = primePlays(seat.ctx, counts)
  if (withComposites) {
    plays.push(...compositePlays(seat.ctx, counts))
  }
  const scored = plays.map((play) => ({ play, score: scorePlay(seat, counts, play) }))
  scored.sort((a, b) => b.score - a.score || a.play.value - b.play.value)
  return scored.map((s) => s.play)
}

/** A composite of the right size above the field that a careless eye would take for a prime. */
function primeLookalike(seat: Seat, rng: Rng): RankPlay | null {
  const { ctx } = seat
  const k = ctx.top?.length ?? 1 + randomInt(rng, Math.min(2, ctx.hand.length))
  if (k > MAX_BOT_CARDS || k > ctx.hand.length) {
    return null
  }
  const floor = ctx.top === null ? 0 : spell(ctx.top.map(cardValue))
  const counts = rankCounts(ctx.hand)
  const looksPrime = (n: number) =>
    n % 2 === 1 &&
    n % 5 !== 0 &&
    String(n)
      .split('')
      .reduce((s, d) => s + Number(d), 0) %
      3 !==
      0
  const options = rankTables().composite[k].filter(
    (s) => s.value > floor && looksPrime(s.value) && fits(counts, s.ranks),
  )
  if (options.length === 0) {
    return null
  }
  const { ranks, value } = options[randomInt(rng, options.length)]
  return { ranks, factor: [], value, shed: k, cut57: false }
}

function decideWeak(core: GameCore, pid: Pid, rng: Rng): BotAction {
  const seat = seatOf(core, pid)
  if (rng.next() < WEAK_BLUNDER_RATE) {
    const fake = primeLookalike(seat, rng)
    if (fake !== null) {
      return submitOf(seat.ctx.hand, fake)
    }
  }
  const plays = primePlays(seat.ctx)
  if (plays.length === 0 || rng.next() < WEAK_OVERLOOK_RATE) {
    return noPlay(seat)
  }
  return submitOf(seat.ctx.hand, plays[randomInt(rng, plays.length)])
}

function decideNormal(core: GameCore, pid: Pid): BotAction {
  const seat = seatOf(core, pid)
  const [best] = rankedPlays(seat, true)
  return best === undefined ? noPlay(seat) : submitOf(seat.ctx.hand, best)
}

/** The fast greedy policy used inside playouts: prime plays only, no hand-shape term. */
function playoutMove(core: GameCore, pid: Pid): Move {
  const seat = seatOf(core, pid)
  const plays = primePlays(seat.ctx)
  let best: RankPlay | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const play of plays) {
    let score = play.shed >= seat.ctx.hand.length ? 1e6 : 10 * play.shed
    if (play.cut57) {
      score += 15
    }
    if (seat.ctx.top !== null) {
      score -= 6 * strength(play.value, play.ranks.length)
    }
    if (score > bestScore) {
      best = play
      bestScore = score
    }
  }
  if (best === null) {
    return noPlay(seat)
  }
  return { type: 'submit', ...toCards(seat.ctx.hand, best) }
}

/** Re-deal every card `pid` cannot see (other hands and the deck), keeping each hand's size. */
export function determinize(core: GameCore, pid: Pid, rng: Rng): GameCore {
  const others = core.playOrder.filter((p) => p !== pid)
  const hidden = shuffle([...core.deck, ...others.flatMap((p) => core.players[p].hand)], rng)
  const players: GameCore['players'] = {
    [pid]: { ...core.players[pid], hand: [...core.players[pid].hand] },
  }
  let at = 0
  for (const p of others) {
    const size = core.players[p].hand.length
    players[p] = { ...core.players[p], hand: hidden.slice(at, at + size) }
    at += size
  }
  return { ...core, players, deck: hidden.slice(at), field: core.field.map((set) => [...set]) }
}

/** Play greedily from `core` and score the result for `pid` in [0, 1]. */
function playout(core: GameCore, pid: Pid, rng: Rng): number {
  let state = core
  for (let moves = 0; moves < STRONG_PLAYOUT_MOVES && state.winner === null; moves += 1) {
    const by = state.currentPlayer
    const result = engine.applyMove(state, by, playoutMove(state, by), rng)
    state = result.ok ? result.core : engine.timeoutPass(state, rng).core
  }
  if (state.winner !== null) {
    return state.winner === pid ? 1 : 0
  }
  if (!state.players[pid]) {
    return 0
  }
  const mine = state.players[pid].hand.length
  const best = Math.min(
    ...state.playOrder.filter((p) => p !== pid).map((p) => state.players[p].hand.length),
  )
  // ahead on cards → above one half
  return 0.5 + Math.max(-0.45, Math.min(0.45, (best - mine) / 20))
}

function decideStrong(core: GameCore, pid: Pid, rng: Rng): BotAction {
  const seat = seatOf(core, pid)
  const ranked = rankedPlays(seat, true)
  if (ranked.length === 0) {
    return noPlay(seat)
  }
  if (ranked[0].shed >= seat.ctx.hand.length) {
    return submitOf(seat.ctx.hand, ranked[0])
  }
  const options: Move[] = ranked
    .slice(0, STRONG_SHORTLIST)
    .map((play) => ({ type: 'submit', ...toCards(seat.ctx.hand, play) }))
  if (seat.ctx.top !== null) {
    // holding back is an option while following
    options.push({ type: 'pass' })
  }
  if (options.length === 1) {
    return options[0] as BotAction
  }
  const totals = new Array<number>(options.length).fill(0)
  for (let deal = 0; deal < STRONG_DEALS; deal += 1) {
    const world = determinize(core, pid, rng)
    // common random numbers: every option sees the same playout randomness for this deal
    const seed = Math.floor(rng.next() * 2 ** 32)
    options.forEach((move, i) => {
      const result = engine.applyMove(world, pid, move, mulberry32(seed))
      if (result.ok) {
        totals[i] += playout(result.core, pid, mulberry32(seed + 1))
      }
    })
  }
  let best = 0
  for (let i = 1; i < options.length; i += 1) {
    // the shortlist is in greedy order, so ties keep the greedy choice
    if (totals[i] > totals[best]) {
      best = i
    }
  }
  return options[best] as BotAction
}

/** The bot's next action on its turn. A draw is followed by another decision on the same turn. */
export function decideBotAction(core: GameCore, pid: Pid, level: BotLevel, rng: Rng): BotAction {
  switch (level) {
    case 'weak':
      return decideWeak(core, pid, rng)
    case 'normal':
      return decideNormal(core, pid)
    default:
      return decideStrong(core, pid, rng)
  }
}
