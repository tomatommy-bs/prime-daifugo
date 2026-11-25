/**
 * Rules engine (spec §7). STUB created by the foundation; T1 owns and implements it.
 * Every method throws until then, so callers can compile against the frozen contract.
 */
import type { GameEngine } from './types'

const notImplemented = (): never => {
  throw new Error('not implemented')
}

export const engine: GameEngine = {
  setup: notImplemented,
  applyMove: notImplemented,
  timeoutPass: notImplemented,
  forfeit: notImplemented,
}

/** True while this module is the foundation stub (lets dependent tests `skipIf` it). */
export const ENGINE_IS_STUB = true
