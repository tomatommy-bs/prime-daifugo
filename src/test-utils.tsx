/**
 * Shared test helpers (spec §6.1 / §10.1).
 *
 * - `renderWithProviders(ui, { colorScheme, reducedMotion })`: Mantine theme + MotionProvider.
 * - `mockMatchMedia(map)`: answers `window.matchMedia` queries (reset after each test).
 * - `makeGameState`, `makeCtx`, `makePresence`: typed fixtures.
 * - `serverMsg.*`: builders for every server → client message (objects; the fake socket's
 *   `__emit` and `JSON.stringify` turn them into wire payloads).
 *
 * Realtime rebuild (docs/realtime/rebuild-spec.md), typed against the frozen contracts:
 * - `makeClientGameState`, `makeClientCtx`, `makeClientBundle`: the UI state shape (§9.3).
 * - `makeSessionPresence`: `SessionPresence[]` for the room container (§9.1).
 * - `makeMember`: a session `Member` (§3.2); `makeViewMember`, `makeView`: the wire view (§6.3).
 * - `frames.*`: server → client room frames (`welcome`, `evt`, `ack`, `bye`) as objects.
 */
import type { SessionPresence } from '@/app/room/[id]/session/types'
import type { CardId } from '@/game-card/src'
import type { SubmitCardSet } from '@/interface/client-to-server'
import type { PrimeDaifugoSetupData } from '@/interface/common'
import type * as serverToClient from '@/interface/server-to-client'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import type { Member } from '@/session/types'
import type { ClientCtx, ClientGameState, ClientGameStateBundle } from '@/shared/client-state'
import type {
  Ack,
  Bye,
  ByeReason,
  Evt,
  RejectReason,
  RoomEvent,
  View,
  ViewGame,
  ViewMember,
  Welcome,
} from '@/shared/protocol'
import { MantineProvider } from '@mantine/core'
import { type RenderOptions, render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MotionProvider } from './design/motion-provider'
import { cssVariablesResolver, theme } from './design/theme'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Set the answers of `window.matchMedia(query).matches`. Unlisted queries answer `false`. */
export function mockMatchMedia(map: Record<string, boolean>): void {
  const setter = (globalThis as Record<string, unknown>).__setMatchMedia as
    | ((m: Record<string, boolean>) => void)
    | undefined
  if (!setter) {
    throw new Error('mockMatchMedia requires vitest.setup.ts')
  }
  setter(map)
}

export type ProviderOptions = {
  colorScheme?: 'light' | 'dark'
  reducedMotion?: boolean
  /** extra matchMedia answers, merged with the reduced-motion query */
  media?: Record<string, boolean>
}

export function Providers({
  children,
  colorScheme = 'light',
}: {
  children: ReactNode
  colorScheme?: 'light' | 'dark'
}) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      forceColorScheme={colorScheme}
    >
      <MotionProvider>{children}</MotionProvider>
    </MantineProvider>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  { colorScheme = 'light', reducedMotion, media, ...options }: ProviderOptions & RenderOptions = {},
) {
  if (reducedMotion !== undefined || media !== undefined) {
    mockMatchMedia({ ...(media ?? {}), [REDUCED_MOTION_QUERY]: reducedMotion === true })
  }
  return render(ui, {
    wrapper: ({ children }) => <Providers colorScheme={colorScheme}>{children}</Providers>,
    ...options,
  })
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_RULE: PrimeDaifugoSetupData = {
  initNumCards: 11,
  maxSubmitNumCards: 4,
  timeLimit: 60,
  halfEvenNumbers: false,
}

type PlayerState = PrimeDaifugoGameState['players'][string]

export function makeGameState(
  partial: Partial<Omit<PrimeDaifugoGameState, 'players'>> & {
    players?: Record<string, Partial<PlayerState>>
  } = {},
): PrimeDaifugoGameState {
  const players: PrimeDaifugoGameState['players'] = {}
  const sourcePlayers = partial.players ?? {
    p1: { hand: ['AS', '3H', 'JD'] as CardId[] },
    p2: { hand: ['2S', '5C', 'KH'] as CardId[] },
  }
  for (const [id, p] of Object.entries(sourcePlayers)) {
    players[id] = { hand: p.hand ?? [], drawRight: p.drawRight ?? true }
  }
  return {
    field: [],
    deck: ['4S', '6D', '7C', '8H', '9S'],
    deckTopPlayer: null,
    lastSubmitError: null,
    rule: DEFAULT_RULE,
    ...partial,
    players,
  }
}

export function makeCtx(partial: Partial<Ctx> = {}): Ctx {
  const playOrder = partial.playOrder ?? ['p1', 'p2']
  const activePlayers =
    partial.activePlayers ??
    (Object.fromEntries(playOrder.map((id) => [id, 'play'])) as Ctx['activePlayers'])
  return {
    numPlayers: playOrder.length,
    currentPlayer: playOrder[0] ?? 'p1',
    ...partial,
    playOrder,
    activePlayers,
  }
}

type PresenceEntry = serverToClient.PresenceEvent['presence'][number]

/**
 * `makePresence(['alice', 'bob'])` → ids p1, p2 (ready).
 * Entries may also be partial objects.
 */
export function makePresence(list: (string | Partial<PresenceEntry>)[]): PresenceEntry[] {
  return list.map((entry, i) => {
    const base: PresenceEntry = { id: `p${i + 1}`, name: `player${i + 1}`, status: 'ready' }
    return typeof entry === 'string' ? { ...base, name: entry } : { ...base, ...entry }
  })
}

type Commander = { id: string; name: string }
type GameArgs = { gameState?: PrimeDaifugoGameState; ctx?: Ctx; commander?: Commander }

const gameBase = ({ gameState, ctx, commander }: GameArgs) => ({
  event: 'system' as const,
  gameState: gameState ?? makeGameState(),
  ctx: ctx ?? makeCtx(),
  commander: commander ?? { id: 'p1', name: 'player1' },
})

/** Builders for every server → client message, valid against `serverToClientSchema`. */
export const serverMsg = {
  chat: (message: string, from = 'p1'): serverToClient.ChatEvent => ({
    event: 'chat',
    message,
    from,
  }),
  presence: (presence: PresenceEntry[]): serverToClient.PresenceEvent => ({
    event: 'presence',
    presence,
  }),
  roomStatus: (
    status: serverToClient.RoomStatusEvent['status'],
  ): serverToClient.RoomStatusEvent => ({ event: 'room-status', status }),
  leftTime: (leftTime: number): serverToClient.LeftTimeEvent => ({
    event: 'left-time',
    leftTime,
  }),
  gameStart: (args: GameArgs = {}): serverToClient.SystemEvent => ({
    ...gameBase(args),
    action: 'game-start',
  }),
  draw: (args: GameArgs = {}): serverToClient.SystemEvent => ({
    ...gameBase(args),
    action: 'draw',
  }),
  pass: (args: GameArgs = {}): serverToClient.SystemEvent => ({
    ...gameBase(args),
    action: 'pass',
  }),
  submit: (
    args: GameArgs & {
      submitCardSet: SubmitCardSet
      result?: serverToClient.SubmissionResult['result']
    },
  ): serverToClient.SystemEvent => ({
    ...gameBase(args),
    action: 'submit',
    submissionResult: { submitCardSet: args.submitCardSet, result: args.result ?? null },
  }),
  gameEnd: (args: GameArgs & { winner: string }): serverToClient.SystemEvent => ({
    ...gameBase(args),
    action: 'game-end',
    winner: args.winner,
  }),
  sync: (
    args: { gameState?: PrimeDaifugoGameState; ctx?: Ctx } = {},
  ): serverToClient.SystemEvent => ({
    event: 'system',
    action: 'sync',
    gameState: args.gameState ?? makeGameState(),
    ctx: args.ctx ?? makeCtx(),
  }),
  changeRule: (
    rule: Partial<PrimeDaifugoSetupData>,
    commander: Commander = { id: 'p1', name: 'player1' },
  ): serverToClient.SystemEvent => ({
    event: 'system',
    action: 'change-rule',
    rule,
    commander,
    ctx: undefined,
    gameState: undefined,
  }),
}

/* ------------------------------------------------------------------ */
/* Realtime rebuild fixtures (spec §3.2, §6, §9)                       */
/* ------------------------------------------------------------------ */

type ClientPlayerInput = { hand?: CardId[]; handCount?: number; drawRight?: boolean }

/**
 * UI game state. Players default to `p1` (self, with a hand) and `p2` (hand hidden).
 * `handCount` defaults to `hand.length`, so pass `{ hand: [], handCount: 5 }` for others.
 */
export function makeClientGameState(
  partial: Partial<Omit<ClientGameState, 'players'>> & {
    players?: Record<string, ClientPlayerInput>
  } = {},
): ClientGameState {
  const source = partial.players ?? {
    p1: { hand: ['AS', '3H', 'JD'] as CardId[] },
    p2: { hand: [], handCount: 3 },
  }
  const players: ClientGameState['players'] = {}
  for (const [id, p] of Object.entries(source)) {
    const hand = p.hand ?? []
    players[id] = { hand, handCount: p.handCount ?? hand.length, drawRight: p.drawRight ?? true }
  }
  return {
    field: [],
    deckCount: 5,
    deckTopPlayer: null,
    rule: DEFAULT_RULE,
    winner: null,
    lastSubmitError: null,
    ...partial,
    players,
  }
}

export function makeClientCtx(partial: Partial<ClientCtx> = {}): ClientCtx {
  const playOrder = partial.playOrder ?? ['p1', 'p2']
  return {
    currentPlayer: playOrder[0] ?? 'p1',
    turn: 0,
    deadline: null,
    ...partial,
    playOrder,
  }
}

export function makeClientBundle(
  partial: {
    gameState?: Parameters<typeof makeClientGameState>[0]
    ctx?: Partial<ClientCtx>
  } = {},
): ClientGameStateBundle {
  return { gameState: makeClientGameState(partial.gameState), ctx: makeClientCtx(partial.ctx) }
}

/**
 * `makeSessionPresence(['alice', 'bob'])` → ids p1, p2 (ready, player, connected).
 * Entries may also be partial objects.
 */
export function makeSessionPresence(
  list: (string | Partial<SessionPresence>)[],
): SessionPresence[] {
  return list.map((entry, i) => {
    const base: SessionPresence = {
      id: `p${i + 1}`,
      name: `player${i + 1}`,
      status: 'ready',
      role: 'player',
      connected: true,
    }
    return typeof entry === 'string' ? { ...base, name: entry } : { ...base, ...entry }
  })
}

/** A connected, not-ready observer who joined at t=0 (session `Member`, spec §3.2). */
export function makeMember(partial: Partial<Member> = {}): Member {
  return {
    name: 'player1',
    joinedAt: 0,
    ready: false,
    readyAt: null,
    role: 'observer',
    connected: true,
    connNo: 1,
    lastSeen: 0,
    graceUntil: null,
    ...partial,
  }
}

export function makeViewMember(partial: Partial<ViewMember> = {}): ViewMember {
  return {
    id: 'p1',
    name: 'player1',
    ready: true,
    role: 'player',
    connected: true,
    ...partial,
  }
}

const defaultViewGame = (): ViewGame => ({
  round: 1,
  turn: 0,
  playOrder: ['p1', 'p2'],
  currentPlayer: 'p1',
  players: { p1: { handCount: 3, drawRight: true }, p2: { handCount: 3, drawRight: true } },
  hand: ['AS', '3H', 'JD'],
  field: [],
  deckCount: 5,
  deckTopPlayer: null,
  deadline: 1_700_000_060_000,
  winner: null,
  lastResult: null,
})

/**
 * A viewer's view (spec §6.3). Defaults: room `1009`, `playing`, members p1/p2, a game in which
 * p1 (the viewer) holds AS 3H JD. Pass `game: null` for a waiting room, or a partial game to
 * override fields of the default game.
 */
export function makeView(
  partial: Partial<Omit<View, 'game'>> & { game?: Partial<ViewGame> | null } = {},
): View {
  const { game, ...rest } = partial
  return {
    roomId: '1009',
    status: game === null ? 'waiting' : 'playing',
    rule: DEFAULT_RULE,
    version: 1,
    members: [
      makeViewMember({ id: 'p1', name: 'player1' }),
      makeViewMember({ id: 'p2', name: 'player2' }),
    ],
    ...rest,
    game: game === null ? null : { ...defaultViewGame(), ...(game ?? {}) },
  }
}

/** Server → client room frames (objects; `JSON.stringify` them for the wire). */
export const frames = {
  welcome: (partial: Partial<Welcome> = {}): Welcome => {
    const mode = partial.mode ?? 'snapshot'
    const snap = partial.snap ?? (mode === 'snapshot' ? makeView() : undefined)
    return {
      t: 'welcome',
      pv: 1,
      selfId: 'p1',
      epoch: 'epoch-1',
      serverNow: 1_700_000_000_000,
      seq: snap?.version ?? 1,
      ...partial,
      mode,
      ...(snap ? { snap } : {}),
    }
  },
  evt: (e: RoomEvent, partial: Partial<Omit<Evt, 'e'>> = {}): Evt => {
    const snap = partial.snap ?? makeView({ version: partial.seq ?? 2 })
    return {
      t: 'evt',
      seq: snap.version,
      serverNow: 1_700_000_000_000,
      ...partial,
      e,
      snap,
    }
  },
  ack: (id: string, result: { seq: number } | { reason: RejectReason } = { seq: 1 }): Ack =>
    'seq' in result
      ? { t: 'ack', id, ok: true, seq: result.seq }
      : { t: 'ack', id, ok: false, reason: result.reason },
  bye: (reason: ByeReason): Bye => ({ t: 'bye', reason }),
}
