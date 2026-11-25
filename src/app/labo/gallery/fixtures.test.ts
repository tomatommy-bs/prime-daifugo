import { buildSeats } from '@/app/room/[id]/_ui/board'
import { cardIds as ALL_CARD_IDS, type CardId } from '@/game-card/src'
import { parseServerFrame } from '@/shared/protocol'
import { Providers } from '@/test-utils'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOARD_SCENES,
  type BoardScene,
  SCENE_IDS,
  SCENE_TITLES,
  WAITING_SCENE,
  bundleOfView,
  isSceneId,
  penaltiesOf,
  presenceOfView,
  visibleCardIds,
} from './fixtures'
import { FLIGHT_STEPS } from './flight-script'

/* ------------------------------------------------------------------ */
/* next/navigation: the page reads ?scene= and ?scheme=                */
/* ------------------------------------------------------------------ */

const nav = vi.hoisted(() => ({ search: '' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => '/labo/gallery',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSelectedLayoutSegment: () => 'gallery',
}))

const RENDER_ERROR = /The above error occurred|Uncaught|Error: /
const OBSERVER_NOTICE = /観戦中です/
const RECONNECTING_LABEL = /（再接続中）$/

const boardScenes = Object.values(BOARD_SCENES) as BoardScene[]
const playing = boardScenes.filter((s) => s.gameState !== null)

/** Round-trip a frame through JSON and the protocol parser, like the socket does. */
const parses = (frame: unknown) => parseServerFrame(JSON.stringify(frame))

describe('gallery fixtures', () => {
  it('cover every scene id', () => {
    expect(SCENE_IDS).toHaveLength(13)
    for (const id of SCENE_IDS) {
      expect(isSceneId(id)).toBe(true)
      expect(SCENE_TITLES[id]).toBeTruthy()
    }
    expect(isSceneId('nope')).toBe(false)
    expect(isSceneId(null)).toBe(false)
    expect(Object.keys(BOARD_SCENES).sort()).toEqual(
      SCENE_IDS.filter((id) => id !== 'home-parts' && id !== 'waiting').sort(),
    )
  })

  it('keeps every scene name scripts/screens.mjs captures', () => {
    for (const id of [
      'home-parts',
      'waiting',
      'my-turn',
      'opp-turn',
      'factor',
      'not-prime',
      'cut57',
      'flow',
      'game-set',
      'observer',
      'connecting',
    ]) {
      expect(isSceneId(id), id).toBe(true)
    }
  })

  describe.each(boardScenes.map((s) => [s.id, s] as const))('%s', (_id, scene) => {
    it('messages are valid server → client room frames', () => {
      for (const frame of scene.messages) {
        const parsed = parses(frame)
        expect(parsed.ok, JSON.stringify(frame).slice(0, 200)).toBe(true)
      }
    })

    it.skipIf(scene.view === null)('the last event frame carries the scene view', () => {
      const evts = scene.messages.filter((m) => m.t === 'evt')
      const last = evts.at(-1)
      expect(last?.t === 'evt' ? last.snap : null).toEqual(scene.view)
      // seq = version, strictly increasing (spec §6.4)
      const seqs = evts.map((m) => (m.t === 'evt' ? m.seq : -1))
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
      for (const m of evts) {
        expect(m.t === 'evt' && m.seq === m.snap.version).toBe(true)
      }
    })

    it.skipIf(scene.view === null)('UI state and presence are the projection of the view', () => {
      const view = scene.view
      if (!view) {
        return
      }
      expect(bundleOfView(view, scene.selfId)).toEqual({
        gameState: scene.gameState,
        ctx: scene.ctx,
      })
      expect(presenceOfView(view)).toEqual(scene.presence)
    })

    it.skipIf(scene.deal === null)('the deal uses each of the 52 cards exactly once', () => {
      const deal = scene.deal
      if (!deal) {
        return
      }
      const all = [...Object.values(deal.hands).flat(), ...deal.field.flat(), ...deal.deck]
      expect(all).toHaveLength(52)
      expect(new Set(all)).toEqual(new Set(ALL_CARD_IDS))
    })

    it.skipIf(scene.deal === null)('the view matches the deal, redacted for the viewer', () => {
      const { deal, view, gameState } = scene
      if (!deal || !view?.game || !gameState) {
        return
      }
      expect(view.game.deckCount).toBe(deal.deck.length)
      expect(gameState.deckCount).toBe(deal.deck.length)
      expect(view.game.field).toEqual(deal.field)
      expect(view.game.hand).toEqual(deal.hands[scene.selfId] ?? [])
      for (const [id, hand] of Object.entries(deal.hands)) {
        expect(view.game.players[id].handCount).toBe(hand.length)
        expect(gameState.players[id].handCount).toBe(hand.length)
        // other hands never reach the client as ids
        expect(gameState.players[id].hand).toEqual(id === scene.selfId ? hand : [])
      }
    })

    it.skipIf(scene.gameState === null)('splits the self hand like useMyField', () => {
      const gs = scene.gameState
      if (!gs || !scene.myField) {
        return
      }
      const own = gs.players[scene.selfId]?.hand ?? []
      const split = [
        ...scene.myField.hand,
        ...scene.myField.tray,
        ...scene.myField.factCards.filter((c): c is CardId => c !== '*' && c !== '^'),
      ]
      expect(new Set(split)).toEqual(new Set(own))
      expect(split).toHaveLength(own.length)
    })
  })

  it('opponent hands stay on the server: views only get counts', () => {
    for (const scene of playing) {
      const gs = scene.gameState
      const ctx = scene.ctx
      const deal = scene.deal
      if (!gs || !ctx || !deal) {
        continue
      }
      const seats = buildSeats({
        gameState: gs,
        ctx,
        presence: scene.presence,
        selfId: scene.selfId,
        passedIds: scene.passedIds,
        leftTime: scene.leftTime,
      })
      for (const seat of seats) {
        expect(Object.keys(seat)).not.toContain('hand')
        const hand = deal.hands[seat.id]
        expect(seat.handCount).toBe(hand ? hand.length : null)
      }
      // somebody else holds cards the views never receive as faces
      const visible = visibleCardIds(scene)
      const hidden = Object.entries(deal.hands)
        .filter(([id]) => id !== scene.selfId)
        .flatMap(([, hand]) => hand)
        .filter((c) => !visible.has(c))
      expect(hidden.length).toBeGreaterThan(0)
      // and the client state carries none of them
      const clientIds = Object.values(gs.players).flatMap((p) => p.hand)
      for (const c of hidden) {
        expect(clientIds).not.toContain(c)
      }
    }
  })

  it('the gallery uses the production seat model: players first, observers after', () => {
    const observer = BOARD_SCENES.observer
    const gs = observer.gameState
    const ctx = observer.ctx
    if (!gs || !ctx) {
      throw new Error('observer scene needs state')
    }
    const seats = buildSeats({
      gameState: gs,
      ctx,
      presence: observer.presence,
      selfId: observer.selfId,
      leftTime: observer.leftTime,
    })
    // the observer (self) is not in the ring: players keep play order, the observer trails
    expect(seats[3]).toMatchObject({
      id: 'p4',
      k: 3,
      isSelf: true,
      observer: true,
      handCount: null,
    })
    expect(seats.map((s) => s.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(seats.find((s) => s.isLead)?.id).toBe('p2')
    expect(seats.find((s) => s.isActive)?.id).toBe('p3')
    // hue follows playOrder, not the rotated index
    expect(seats.map((s) => s.hueIndex)).toEqual([0, 1, 2, 3])

    const notPrime = BOARD_SCENES['not-prime']
    const nps = buildSeats({
      gameState: notPrime.gameState as NonNullable<BoardScene['gameState']>,
      ctx: notPrime.ctx as NonNullable<BoardScene['ctx']>,
      presence: notPrime.presence,
      selfId: 'p1',
      leftTime: 60,
      penalties: penaltiesOf(notPrime.penalty),
    })
    expect(nps.find((s) => s.id === 'p2')?.penalty).toBe(3)
    expect(nps.find((s) => s.isActive)?.leftTime).toBe(60)
  })

  it('reconnecting-seat: bob is disconnected on his own turn', () => {
    const scene = BOARD_SCENES['reconnecting-seat']
    expect(scene.presence.find((p) => p.id === 'p2')).toMatchObject({ connected: false })
    expect(scene.messages.some((m) => m.t === 'evt' && m.e.type === 'presence')).toBe(true)
    const seats = buildSeats({
      gameState: scene.gameState as NonNullable<BoardScene['gameState']>,
      ctx: scene.ctx as NonNullable<BoardScene['ctx']>,
      presence: scene.presence,
      selfId: scene.selfId,
      leftTime: scene.leftTime,
    })
    const bob = seats.find((s) => s.id === 'p2')
    expect(bob).toMatchObject({ connected: false, isActive: true })
    expect(seats.filter((s) => s.connected === false)).toHaveLength(1)
    // a disconnected player's turn is capped at 20 s (owner decision)
    expect(scene.leftTime).toBeLessThanOrEqual(20)
  })

  it('superseded: a terminal bye closes the session with its reason', () => {
    const scene = BOARD_SCENES.superseded
    expect(scene.messages.at(-1)).toEqual({ t: 'bye', reason: 'superseded' })
    expect(scene).toMatchObject({ connection: 'closed', closeReason: 'superseded' })
    // every other scene is open (or connecting) without a close reason
    for (const other of boardScenes.filter((s) => s.id !== 'superseded')) {
      expect(other.closeReason).toBeNull()
    }
  })

  it('arithmetic of the featured scenes holds', () => {
    // factor: tray 112 = 2⁴ · 7, built from the self hand
    const factor = BOARD_SCENES.factor.myField
    expect(factor?.tray).toEqual(['JH', '2H'])
    expect(factor?.factCards).toEqual(['2S', '^', '4C', '*', '7D'])
    expect(2 ** 4 * 7).toBe(112)
    // not-prime: 221 = 13 · 17 with a 3-card penalty, also in the event
    expect(BOARD_SCENES['not-prime'].result).toMatchObject({ value: 221, penalty: 3 })
    expect(13 * 17).toBe(221)
    const fail = BOARD_SCENES['not-prime'].messages.find((m) => m.t === 'evt')
    expect(fail?.t === 'evt' ? fail.e : null).toMatchObject({
      type: 'submitted',
      result: 'BASE_IS_NOT_PRIME',
      penalty: 3,
    })
    expect(BOARD_SCENES['not-prime'].gameState?.lastSubmitError).toBe('BASE_IS_NOT_PRIME')
    // cut57 plays over the pre-cut field and the server field is already clear
    expect(BOARD_SCENES.cut57.fieldView.at(-1)).toEqual(['5D', '7D'])
    expect(BOARD_SCENES.cut57.gameState?.field).toEqual([])
    // the observer is a member but neither in playOrder nor in players
    expect(BOARD_SCENES.observer.ctx?.playOrder).not.toContain('p4')
    expect(BOARD_SCENES.observer.gameState?.players.p4).toBeUndefined()
    expect(BOARD_SCENES.observer.presence.find((p) => p.id === 'p4')?.role).toBe('observer')
    // game-set: submitted then game-ended, and the server names the winner
    const gameSet = BOARD_SCENES['game-set']
    expect(
      gameSet.messages.filter((m) => m.t === 'evt').map((m) => m.t === 'evt' && m.e.type),
    ).toEqual(['submitted', 'game-ended'])
    expect(gameSet.gameState?.winner).toBe('p2')
    expect(gameSet.ctx?.deadline).toBeNull()
  })

  it('waiting room frames are valid and someone is not ready', () => {
    for (const frame of WAITING_SCENE.messages) {
      expect(parses(frame).ok).toBe(true)
    }
    expect(WAITING_SCENE.presence.some((p) => p.status === 'not-ready')).toBe(true)
    expect(presenceOfView(WAITING_SCENE.view)).toEqual(WAITING_SCENE.presence)
  })

  it('flight steps carry the UI shape: only alice sees card ids', () => {
    for (const step of Object.values(FLIGHT_STEPS)) {
      for (const s of [step.before, step.next]) {
        for (const [id, p] of Object.entries(s.gameState.players)) {
          expect(p.hand.length).toBe(id === step.selfId ? p.handCount : 0)
        }
      }
    }
    // the opponent's draw is visible only as a count
    const drawOpp = FLIGHT_STEPS['draw-opp']
    expect(drawOpp.next.gameState.players.p2.handCount).toBe(
      drawOpp.before.gameState.players.p2.handCount + 1,
    )
    expect(drawOpp.next.gameState.deckCount).toBe(drawOpp.before.gameState.deckCount - 1)
  })
})

/* ------------------------------------------------------------------ */
/* Gallery smoke render: every scene renders in jsdom, no socket       */
/* ------------------------------------------------------------------ */

describe('/labo/gallery smoke', () => {
  beforeEach(() => {
    nav.search = ''
  })

  const renderGallery = async (search: string) => {
    nav.search = search
    const { default: GalleryPage } = await import('./page')
    return render(createElement(Providers, null, createElement(GalleryPage)))
  }

  it('renders the scene index without a scene param', async () => {
    const { getByRole, getAllByRole } = await renderGallery('')
    expect(getByRole('heading', { name: 'デザインギャラリー' })).toBeInTheDocument()
    const links = getAllByRole('link').map((a) => a.getAttribute('href'))
    for (const id of SCENE_IDS) {
      expect(links).toContain(`/labo/gallery?scene=${id}`)
      expect(links).toContain(`/labo/gallery?scene=${id}&scheme=dark`)
    }
  })

  it.each(SCENE_IDS.flatMap((id) => [[id, 'light'] as const, [id, 'dark'] as const]))(
    'renders %s (%s) without runtime errors',
    async (id, scheme) => {
      const errors: unknown[] = []
      const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
        errors.push(args)
      })
      const { container } = await renderGallery(`scene=${id}&scheme=${scheme}`)
      spy.mockRestore()

      const root = container.querySelector(`[data-gallery-scene="${id}"]`)
      expect(root).not.toBeNull()
      expect(root).toHaveAttribute('data-scheme', scheme)
      expect(root?.textContent?.length ?? 0).toBeGreaterThan(0)
      // React render errors (not DOM prop warnings from components still being rebuilt)
      const renderErrors = errors.filter((args) =>
        String((args as unknown[])[0]).match(RENDER_ERROR),
      )
      expect(renderErrors).toEqual([])

      if (id in BOARD_SCENES) {
        const scene = BOARD_SCENES[id as keyof typeof BOARD_SCENES]
        // anti-leak: only public cards are ever rendered as faces
        const visible = visibleCardIds(scene)
        const faces = Array.from(container.querySelectorAll('[data-card]'))
          .map((el) => el.getAttribute('data-card') as CardId | 'Back')
          .filter((c) => c !== 'Back')
        for (const card of faces) {
          expect(visible.has(card as CardId), `${card} must not be shown in ${id}`).toBe(true)
        }
        if (scene.myField === null) {
          expect(container.querySelector('[role="listbox"][aria-label="手札"]')).toBeNull()
        } else {
          expect(container.querySelector('[role="listbox"][aria-label="手札"]')).not.toBeNull()
        }
      }
    },
  )

  it('shows the observer notice instead of a hand', async () => {
    const { getAllByText } = await renderGallery('scene=observer')
    expect(getAllByText(OBSERVER_NOTICE).length).toBeGreaterThan(0)
  })

  it('reconnecting-seat marks bob ◌（再接続中）', async () => {
    const { container } = await renderGallery('scene=reconnecting-seat')
    const seat = container.querySelector('[data-seat-anchor="p2"]') as HTMLElement
    expect(seat).toHaveAttribute('data-connected', 'false')
    expect(seat.getAttribute('aria-label')).toMatch(RECONNECTING_LABEL)
    expect(container.querySelectorAll('[data-connected="false"]')).toHaveLength(1)
  })

  it('superseded scene shows the other-tab notice with このタブで再開', async () => {
    const { getByRole } = await renderGallery('scene=superseded')
    expect(getByRole('alert')).toHaveTextContent('別のタブで開かれています')
    expect(getByRole('button', { name: 'このタブで再開' })).toBeInTheDocument()
  })

  it('connecting scene shows the connection state', async () => {
    const { container } = await renderGallery('scene=connecting')
    expect(container.textContent).toContain('接続中')
  })

  it('game-set scene opens the dialog with the winner', async () => {
    const { container } = await renderGallery('scene=game-set')
    expect(document.body.textContent).toContain('bob')
    expect(container.querySelector('[data-gallery-scene="game-set"]')).not.toBeNull()
  })

  it('selecting a hand card moves it to the tray (local, no socket)', async () => {
    const { container } = await renderGallery('scene=my-turn')
    const hand = container.querySelector('[role="listbox"][aria-label="手札"]') as HTMLElement
    const tray = container.querySelector('[role="listbox"][aria-label="提出"]') as HTMLElement
    const first = hand.querySelector('[role="option"]') as HTMLElement
    const card =
      first.getAttribute('data-card') ??
      first.querySelector('[data-card]')?.getAttribute('data-card')
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(first)
    expect(tray.querySelector(`[data-card="${card}"]`)).not.toBeNull()
    expect(hand.querySelector(`[data-card="${card}"]`)).toBeNull()
  })
})
