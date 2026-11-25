/**
 * The simulator world: one room host, the network, any number of client tabs and virtual time,
 * with every invariant checked after every clock step (spec §12.1).
 */
import type { CardId, GameEngine, Move } from '../../game/types'
import type { Cmd, View } from '../../shared/protocol'
import { type Rng, mulberry32 } from '../../shared/rng'
import type { RoomConfig, RoomState, ViewFor } from '../types'
import { DEFAULT_ROOM_CONFIG } from '../types'
import { viewFor } from '../view'
import {
  CardLedger,
  checkClientView,
  checkFrameLeak,
  checkHostInvariants,
  checkStateInvariants,
  checkStep,
} from './invariants'
import { type ClientModel, type MinimalClientState, SimClient } from './sim-client'
import { SimClock } from './sim-clock'
import { SimHost } from './sim-host'
import { SimNetwork, type SimNetworkOptions } from './sim-network'

export type SimWorldOptions<S> = {
  seed: number
  engine: GameEngine
  config?: Partial<RoomConfig>
  start?: number
  duplicateAlarmProb?: number
  network?: SimNetworkOptions
  /** client model factory (integration passes the real `clientReduce` adapter) */
  model?: ClientModel<S>
  view?: ViewFor
}

export type TimelineEntry = { at: number; seq: number; type: string; by?: string; reason?: string }

export class SimWorld<S = MinimalClientState> {
  readonly clock: SimClock
  readonly rng: Rng
  readonly network: SimNetwork
  readonly host: SimHost
  readonly config: RoomConfig
  readonly clients: SimClient<S>[] = []
  readonly timeline: TimelineEntry[] = []
  private readonly ledger = new CardLedger()
  private readonly opts: SimWorldOptions<S>
  private readonly view: ViewFor

  constructor(opts: SimWorldOptions<S>) {
    this.opts = opts
    this.rng = mulberry32(opts.seed)
    this.config = { ...DEFAULT_ROOM_CONFIG, ...opts.config }
    this.view = opts.view ?? viewFor
    this.clock = new SimClock({
      start: opts.start ?? 1_700_000_000_000,
      rng: mulberry32(opts.seed ^ 0x9e3779b9),
      duplicateAlarmProb: opts.duplicateAlarmProb ?? 0.2,
    })
    this.network = new SimNetwork(this.clock, mulberry32(opts.seed ^ 0x51ed270b), opts.network)
    this.host = new SimHost({
      clock: this.clock,
      network: this.network,
      engine: opts.engine,
      config: this.config,
      rng: mulberry32(opts.seed ^ 0x2545f491),
      view: this.view,
      onSend: checkFrameLeak,
      onStep: (prev, input, result) => {
        checkStep(prev, input, result)
        for (const { seq, e } of result.events) {
          this.timeline.push({
            at: this.clock.now,
            seq,
            type: e.type,
            by: 'by' in e ? e.by : 'pid' in e ? e.pid : undefined,
            reason: 'reason' in e ? e.reason : undefined,
          })
        }
      },
    })
    this.clock.afterEach = () => this.checkInvariants()
  }

  addClient(name: string, opts: { pid?: string; connect?: boolean } = {}): SimClient<S> {
    const client = new SimClient<S>({
      clock: this.clock,
      network: this.network,
      rng: mulberry32(this.opts.seed + this.clients.length * 7919),
      pid: opts.pid ?? `p-${name}`,
      name,
      model: this.opts.model,
    })
    this.clients.push(client)
    if (opts.connect !== false) {
      client.connect()
    }
    return client
  }

  /** Open a second tab for the same identity. */
  secondTab(of: SimClient<S>): SimClient<S> {
    return this.addClient(of.name, { pid: of.pid })
  }

  get state(): RoomState {
    if (this.host.state === null) {
      throw new Error('room has no state')
    }
    return this.host.state
  }

  run(ms: number): void {
    this.clock.advance(ms)
  }

  /** Let in-flight frames land (no faults). */
  settle(): void {
    this.clock.advance(1000)
  }

  checkInvariants(): void {
    const state = this.host.state
    if (state === null) {
      return
    }
    checkStateInvariants(state)
    checkHostInvariants(state, this.host.conns, this.host.lastResult?.lobbyCount ?? null)
    this.ledger.check(state)
    const wake = this.host.lastResult?.wakeAt ?? null
    const alarm = this.clock.alarmAt
    if (wake !== null && (alarm === null || alarm > Math.max(wake, this.clock.now))) {
      throw new Error(`alarm ${alarm} is later than wakeAt ${wake}`)
    }
  }

  /** §12.1: every client that is caught up shows exactly `viewFor(state, pid)`. */
  checkCaughtUp(): number {
    const state = this.host.state
    if (state === null) {
      return 0
    }
    let checked = 0
    for (const c of this.clients) {
      const conn = c.conn
      if (
        !c.ready ||
        conn === null ||
        conn.dead ||
        !conn.serverAttached ||
        conn.inFlightToClient > 0 ||
        conn.inFlightToServer > 0
      ) {
        continue
      }
      const m = state.members[c.pid]
      if (!m || !m.connected || m.connNo !== conn.connNo) {
        continue
      }
      checkClientView(c.pid, c.view, state, this.view)
      c.impl.checkCaughtUp?.(c.model, this.view(state, c.pid), c.pid)
      checked += 1
    }
    return checked
  }

  /* ---------------------------- helpers ---------------------------- */

  client(name: string): SimClient<S> {
    const c = this.clients.find((x) => x.name === name)
    if (!c) {
      throw new Error(`no client ${name}`)
    }
    return c
  }

  cmd(c: SimClient<S>, cmd: Cmd): string {
    return c.send(cmd)
  }

  /** Send a move for the client's current view of the turn. */
  move(c: SimClient<S>, move: Move, turn?: number): string {
    const t = turn ?? c.view?.game?.turn ?? 0
    switch (move.type) {
      case 'draw':
        return c.send({ type: 'draw', turn: t })
      case 'pass':
        return c.send({ type: 'pass', turn: t })
      default:
        return c.send({ type: 'submit', turn: t, submit: move.submit, factor: move.factor })
    }
  }

  /** Connect the given names, ready them, start, and settle. */
  startGame(names: string[]): SimClient<S>[] {
    const cs = names.map(
      (n) =>
        [...this.clients].reverse().find((c) => c.name === n && c.terminal === null) ??
        this.addClient(n),
    )
    this.settle()
    for (const c of cs) {
      if (!this.state.members[c.pid]?.ready) {
        c.send({ type: 'ready' })
        this.clock.advance(10)
      }
    }
    this.settle()
    cs[0].send({ type: 'start', expectedVersion: this.state.version })
    this.settle()
    return cs
  }

  currentPid(): string | null {
    return this.host.state?.game?.core.currentPlayer ?? null
  }

  clientByPid(pid: string): SimClient<S> {
    const cs = this.clients.filter((c) => c.pid === pid)
    return cs.find((c) => c.terminal === null) ?? cs[cs.length - 1]
  }

  /**
   * Stage `pid`'s hand as exactly `cards` (taken from wherever they are); every other card it
   * held goes to the deck and the field is flowed into the deck. Card multiset is preserved.
   */
  stageHand(pid: string, cards: CardId[]): void {
    this.host.patchState((draft) => {
      const core = draft.game?.core
      if (!core) {
        throw new Error('no game')
      }
      core.deck.push(...core.field.flat())
      core.field = []
      core.deckTopPlayer = null
      const take = (card: CardId) => {
        for (const p of Object.values(core.players)) {
          const i = p.hand.indexOf(card)
          if (i >= 0) {
            p.hand.splice(i, 1)
            return
          }
        }
        const i = core.deck.indexOf(card)
        if (i < 0) {
          throw new Error(`card ${card} not found`)
        }
        core.deck.splice(i, 1)
      }
      const me = core.players[pid]
      const rest = me.hand.filter((c) => !cards.includes(c))
      me.hand = me.hand.filter((c) => cards.includes(c))
      for (const c of cards) {
        if (!me.hand.includes(c)) {
          take(c)
        }
      }
      me.hand = [...cards]
      core.deck.push(...rest)
    })
  }

  views(): Record<string, View | null> {
    return Object.fromEntries(this.clients.map((c) => [c.name, c.view]))
  }
}
