/**
 * Shared test helpers (spec §6.1 / §10.1).
 *
 * - `renderWithProviders(ui, { colorScheme, reducedMotion })`: Mantine theme + MotionProvider.
 * - `mockMatchMedia(map)`: answers `window.matchMedia` queries (reset after each test).
 * - `makeGameState`, `makeCtx`, `makePresence`: typed fixtures.
 * - `serverMsg.*`: builders for every server → client message (objects; the fake socket's
 *   `__emit` and `JSON.stringify` turn them into wire payloads).
 */
import type { CardId } from '@/game-card/src'
import type { SubmitCardSet } from '@/interface/client-to-server'
import type { PrimeDaifugoSetupData } from '@/interface/common'
import type * as serverToClient from '@/interface/server-to-client'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import { MantineProvider } from '@mantine/core'
import { type RenderOptions, render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MotionProvider } from './design/motion-provider'
import { theme } from './design/theme'

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
    <MantineProvider theme={theme} forceColorScheme={colorScheme}>
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
