import { buildSeats } from '@/app/room/[id]/_ui/board'
import { cardIds as ALL_CARD_IDS, type CardId } from '@/game-card/src'
import { serverToClientSchema } from '@/interface/server-to-client'
import { CtxSchema } from '@/partykit/room/logic/game-rule'
import { PrimeDaifugoGameStateSchema } from '@/partykit/room/logic/game-rule/game-state'
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
  isSceneId,
  penaltiesOf,
  visibleCardIds,
} from './fixtures'

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

const boardScenes = Object.values(BOARD_SCENES) as BoardScene[]
const playing = boardScenes.filter((s) => s.gameState !== null)

describe('gallery fixtures', () => {
  it('cover every scene id', () => {
    expect(SCENE_IDS).toHaveLength(11)
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

  describe.each(boardScenes.map((s) => [s.id, s] as const))('%s', (_id, scene) => {
    it('messages are valid server → client payloads', () => {
      for (const msg of scene.messages) {
        // round-trip through JSON like the socket does
        const parsed = serverToClientSchema.safeParse(JSON.parse(JSON.stringify(msg)))
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
      }
    })

    it.skipIf(scene.gameState === null)('game state and ctx match the server schemas', () => {
      expect(PrimeDaifugoGameStateSchema.safeParse(scene.gameState).success).toBe(true)
      expect(CtxSchema.safeParse(scene.ctx).success).toBe(true)
    })

    it.skipIf(scene.gameState === null)('uses each of the 52 cards exactly once', () => {
      const gs = scene.gameState
      if (!gs) {
        return
      }
      const all = [
        ...Object.values(gs.players).flatMap((p) => p.hand),
        ...gs.field.flat(),
        ...gs.deck,
      ]
      expect(all).toHaveLength(52)
      expect(new Set(all).size).toBe(52)
      expect(new Set(all)).toEqual(new Set(ALL_CARD_IDS))
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

    it.skipIf(scene.gameState === null)('the last system message carries the scene state', () => {
      const last = [...scene.messages]
        .reverse()
        .find((m) => m.event === 'system' && m.action !== 'change-rule')
      expect(last && 'gameState' in last ? last.gameState : null).toEqual(scene.gameState)
    })
  })

  it('opponent hands are in the state but views only get counts', () => {
    for (const scene of playing) {
      const gs = scene.gameState
      const ctx = scene.ctx
      if (!gs || !ctx) {
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
        const player = gs.players[seat.id]
        expect(seat.handCount).toBe(player ? player.hand.length : null)
      }
      // somebody else holds cards the views never receive as faces
      const visible = visibleCardIds(scene)
      const hidden = Object.entries(gs.players)
        .filter(([id]) => id !== scene.selfId)
        .flatMap(([, p]) => p.hand)
        .filter((c) => !visible.has(c))
      expect(hidden.length).toBeGreaterThan(0)
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

  it('arithmetic of the featured scenes holds', () => {
    // factor: tray 112 = 2⁴ · 7, built from the self hand
    const factor = BOARD_SCENES.factor.myField
    expect(factor?.tray).toEqual(['JH', '2H'])
    expect(factor?.factCards).toEqual(['2S', '^', '4C', '*', '7D'])
    expect(2 ** 4 * 7).toBe(112)
    // not-prime: 221 = 13 · 17 with a 3-card penalty
    expect(BOARD_SCENES['not-prime'].result).toMatchObject({ value: 221, penalty: 3 })
    expect(13 * 17).toBe(221)
    // cut57 plays over the pre-cut field and the server field is already clear
    expect(BOARD_SCENES.cut57.fieldView.at(-1)).toEqual(['5D', '7D'])
    expect(BOARD_SCENES.cut57.gameState?.field).toEqual([])
    // the observer is in playOrder (server quirk) but not in players
    expect(BOARD_SCENES.observer.ctx?.playOrder).toContain('p4')
    expect(BOARD_SCENES.observer.gameState?.players.p4).toBeUndefined()
  })

  it('waiting room messages are valid and someone is not ready', () => {
    for (const msg of WAITING_SCENE.messages) {
      expect(serverToClientSchema.safeParse(msg).success).toBe(true)
    }
    expect(WAITING_SCENE.presence.some((p) => p.status === 'not-ready')).toBe(true)
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
