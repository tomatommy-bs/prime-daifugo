/**
 * Room reducer (spec §3-§6). STUB created by the foundation; T2 owns and implements it.
 * `initialRoomState` is already usable; `roomReduce` throws until T2 lands.
 */
import { DEFAULT_RULE } from '../shared/rule-options'
import type { InitialRoomState, RoomReducer } from './types'
import { ROOM_STATE_SCHEMA } from './types'

export const initialRoomState: InitialRoomState = (roomId, epoch, _config) => ({
  schema: ROOM_STATE_SCHEMA,
  roomId,
  epoch,
  version: 0,
  ringFloor: 1,
  status: 'waiting',
  rule: { ...DEFAULT_RULE },
  members: {},
  game: null,
  gcAt: null,
  lastReportedCount: 0,
  lastReportAt: 0,
})

export const roomReduce: RoomReducer = () => {
  throw new Error('not implemented')
}

/** True while this module is the foundation stub (lets dependent tests `skipIf` it). */
export const REDUCER_IS_STUB = true
