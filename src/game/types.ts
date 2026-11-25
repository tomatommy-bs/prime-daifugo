/**
 * Rules-engine contract (spec §7.1). Frozen: owned by the foundation, implemented by T1
 * (`src/game/engine.ts`), consumed by the session reducer (T2) through `ReducerDeps.engine`.
 *
 * - The engine is pure and deterministic given the injected `Rng` (RQ-R20).
 * - It never mutates its input `core` (it works on a `structuredClone`). A rejected move
 *   returns no new core.
 * - `GameCore` is plain JSON: it round-trips through `JSON.stringify`/`JSON.parse`.
 */
import type { FactCardId, PrimeDaifugoSetupData } from '@/interface/common'
import type { CardId, Pid } from '../shared/ids'

export type { CardId, FactCardId, Pid, PrimeDaifugoSetupData }

/** Random source in [0, 1). Production: crypto-backed; tests: seeded mulberry32 (`src/shared/rng.ts`). */
export interface Rng {
  next(): number
}

/** Result codes of a judged (not malformed) submission (RQ-R13). */
export type SubmitResultCode =
  | 'BASE_IS_NOT_PRIME'
  /** kept for UI type compatibility; the engine never emits it (malformed → reject `invalid-fact`) */
  | 'INVALID_FACT'
  | 'FACT_CONTAIN_NOT_PRIME'
  | 'INCORRECT_ANSWER'

export type Move =
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'submit'; submit: CardId[]; factor: FactCardId[] }

export type GamePlayer = { hand: CardId[]; drawRight: boolean }

export type GameCore = {
  rule: PrimeDaifugoSetupData
  /** seated players in turn order (observers are never here, RQ-R6) */
  playOrder: Pid[]
  currentPlayer: Pid
  /** increments on every turn change, including the 57 keep-turn (spec §7.1) */
  turn: number
  players: Record<Pid, GamePlayer>
  /** draws take from the END of this array (RQ-R15) */
  deck: CardId[]
  field: CardId[][]
  deckTopPlayer: Pid | null
  lastResult: SubmitResultCode | null
  /** set when a hand becomes empty, before any flow resets `deckTopPlayer` (RQ-R18) */
  winner: Pid | null
}

export type MoveOutcome =
  | { kind: 'drew' }
  | { kind: 'passed'; flowed: boolean }
  | {
      kind: 'submitted'
      result: SubmitResultCode | null
      cut57: boolean
      flowed: boolean
      /** cards drawn as a penalty (0 on success) */
      penalty: number
      /** the game ended with this move (`core.winner` is set) */
      ended: boolean
    }

export type EngineReject =
  | 'not-your-turn'
  | 'bad-status'
  | 'invalid-move'
  | 'invalid-fact'
  | 'deck-empty'
  | 'already-drawn'

export type SetupResult =
  | { ok: true; core: GameCore }
  | { ok: false; reason: 'bad-player-count' | 'deck-too-small' }

export type ApplyMoveResult =
  | { ok: true; core: GameCore; outcome: MoveOutcome }
  | { ok: false; reason: EngineReject }

export type PassedOutcome = Extract<MoveOutcome, { kind: 'passed' }>

export interface GameEngine {
  /** Deal for `seats` (2..4) in the given order; `currentPlayer = playOrder[0]`, `turn = 0`. */
  setup(seats: Pid[], rule: PrimeDaifugoSetupData, rng: Rng): SetupResult
  applyMove(core: GameCore, by: Pid, move: Move, rng: Rng): ApplyMoveResult
  /** The current player passes because the deadline passed; identical to a manual pass. */
  timeoutPass(core: GameCore, rng: Rng): { core: GameCore; outcome: PassedOutcome }
  /** Remove `pid` from the game (spec §3.6). `ended` when one seat remains (it wins). */
  forfeit(core: GameCore, pid: Pid, rng: Rng): { core: GameCore; flowed: boolean; ended: boolean }
}
