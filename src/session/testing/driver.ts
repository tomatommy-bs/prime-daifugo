/**
 * Test driver for the room reducer: holds state and virtual time, assigns connNos the way the
 * host does, and deep-freezes every input state so any mutation by the reducer throws.
 */
import type { GameEngine } from '../../game/types'
import type { Cmd } from '../../shared/protocol'
import { type Rng, mulberry32 } from '../../shared/rng'
import { initialRoomState, roomReduce } from '../reducer'
import type { Pid, ReducerResult, RoomConfig, RoomState, SessionInput } from '../types'
import { DEFAULT_ROOM_CONFIG } from '../types'
import { fakeEngine } from './fake-engine'

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) {
      deepFreeze(v)
    }
  }
  return value
}

export type DriverOptions = {
  now?: number
  seed?: number
  engine?: GameEngine
  config?: Partial<RoomConfig>
  roomId?: string
  epoch?: string
}

export class Driver {
  state: RoomState
  now: number
  readonly rng: Rng
  readonly engine: GameEngine
  readonly config: RoomConfig
  last: ReducerResult | null = null
  private cmdNo = 0
  private connNos = new Map<Pid, number>()

  constructor(opts: DriverOptions = {}) {
    this.now = opts.now ?? 1_000_000
    this.rng = mulberry32(opts.seed ?? 1)
    this.engine = opts.engine ?? fakeEngine
    this.config = { ...DEFAULT_ROOM_CONFIG, ...opts.config }
    this.state = initialRoomState(opts.roomId ?? 'room1', opts.epoch ?? 'ep1', this.config)
  }

  step(input: SessionInput): ReducerResult {
    deepFreeze(this.state)
    const result = roomReduce(this.state, input, {
      now: this.now,
      rng: this.rng,
      engine: this.engine,
      config: this.config,
    })
    this.state = result.state
    this.last = result
    return result
  }

  advance(ms: number): this {
    this.now += ms
    return this
  }

  /** Next connNo the host would assign for `pid`. */
  nextConnNo(pid: Pid): number {
    const n = Math.max(this.connNos.get(pid) ?? 0, this.state.members[pid]?.connNo ?? 0) + 1
    this.connNos.set(pid, n)
    return n
  }

  connNo(pid: Pid): number {
    return this.state.members[pid]?.connNo ?? 0
  }

  connect(
    pid: Pid,
    name = `n-${pid}`,
    opts: { lastSeq?: number | null; epoch?: string | null } = {},
  ): ReducerResult {
    return this.step({
      type: 'connect',
      pid,
      name,
      connNo: this.nextConnNo(pid),
      lastSeq: opts.lastSeq ?? null,
      epoch: opts.epoch ?? null,
    })
  }

  disconnect(pid: Pid, connNo = this.connNo(pid)): ReducerResult {
    return this.step({ type: 'disconnect', pid, connNo })
  }

  cmd(pid: Pid, cmd: Cmd, connNo = this.connNo(pid)): ReducerResult {
    this.cmdNo += 1
    return this.step({ type: 'command', pid, connNo, id: `c${this.cmdNo}`, cmd })
  }

  tick(): ReducerResult {
    return this.step({ type: 'tick' })
  }

  reconcile(live: { pid: Pid; connNo: number }[]): ReducerResult {
    return this.step({ type: 'reconcile', live })
  }

  /** Connect everyone, ready them in order (1 ms apart) and start. */
  startGame(pids: Pid[]): ReducerResult {
    for (const pid of pids) {
      if (!this.state.members[pid]?.connected) {
        this.connect(pid)
      }
    }
    for (const pid of pids) {
      if (!this.state.members[pid].ready) {
        this.advance(1)
        this.cmd(pid, { type: 'ready' })
      }
    }
    return this.cmd(pids[0], { type: 'start', expectedVersion: this.state.version })
  }

  get game() {
    if (this.state.game === null) {
      throw new Error('no game')
    }
    return this.state.game
  }

  get current(): Pid {
    return this.game.core.currentPlayer
  }

  get turn(): number {
    return this.game.core.turn
  }

  /** The ack directive of the last result. */
  get ack() {
    const ack = this.last?.directives.find((d) => d.type === 'ack')
    if (!ack || ack.type !== 'ack') {
      throw new Error('no ack')
    }
    return ack.result
  }

  get eventTypes(): string[] {
    return (this.last?.events ?? []).map((e) => e.e.type)
  }
}
