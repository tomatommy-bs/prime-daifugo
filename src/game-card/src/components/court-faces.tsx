'use client'
/**
 * The 12 court faces (J/Q/K) are ~5.1 MB of the 5.4 MB of card SVG: each is its own lazy
 * chunk, so pages that show no court card (the waiting room, most of /labo/calc) never
 * download them, and the board fetches them in the background once it is on screen.
 */
import { type ComponentType, type SVGProps, lazy } from 'react'
import type { CardId } from '../tools/suit-num'

export type CourtCardId = Extract<CardId, `${'J' | 'Q' | 'K'}${string}`>

type Face = ComponentType<SVGProps<SVGSVGElement>>

const LOADERS: Record<CourtCardId, () => Promise<{ default: Face }>> = {
  JC: () => import('./icons/Jc'),
  JD: () => import('./icons/Jd'),
  JH: () => import('./icons/Jh'),
  JS: () => import('./icons/Js'),
  QC: () => import('./icons/Qc'),
  QD: () => import('./icons/Qd'),
  QH: () => import('./icons/Qh'),
  QS: () => import('./icons/Qs'),
  KC: () => import('./icons/Kc'),
  KD: () => import('./icons/Kd'),
  KH: () => import('./icons/Kh'),
  KS: () => import('./icons/Ks'),
}

export const COURT_CARD_IDS = Object.keys(LOADERS) as CourtCardId[]

export const isCourtCard = (card: CardId | 'Back'): card is CourtCardId => card in LOADERS

export const COURT_FACES = Object.fromEntries(
  COURT_CARD_IDS.map((id) => [id, lazy(LOADERS[id])]),
) as unknown as Record<CourtCardId, Face>

/** Start loading every court face (idempotent: the module cache dedupes the imports). */
export function preloadCourtFaces(): Promise<unknown> {
  return Promise.all(COURT_CARD_IDS.map((id) => LOADERS[id]()))
}

const SUIT: Record<string, { glyph: string; color: string; name: string }> = {
  C: { glyph: '♣', color: '#15171C', name: 'Clubs' },
  S: { glyph: '♠', color: '#15171C', name: 'Spades' },
  H: { glyph: '♥', color: '#B3361B', name: 'Hearts' },
  D: { glyph: '♦', color: '#B3361B', name: 'Diamonds' },
}
const RANK: Record<string, string> = { J: 'Jack', Q: 'Queen', K: 'King' }

/** Shown while a court face loads: a white face with its rank and suit, same box and a11y. */
export function CourtPlaceholder({
  card,
  ...props
}: SVGProps<SVGSVGElement> & { card: CourtCardId }) {
  const suit = SUIT[card[1]]
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0.69em"
      height="1em"
      viewBox="0 0 167.087 242.667"
      data-placeholder=""
      {...props}
    >
      <title>{`${RANK[card[0]]} of ${suit.name}`}</title>
      <rect
        x="0.25"
        y="0.25"
        width="166.6"
        height="242.2"
        rx="7"
        fill="#fff"
        stroke="#000"
        strokeWidth="0.5"
      />
      <text x="83.5" y="140" textAnchor="middle" fontSize="72" fontWeight="700" fill={suit.color}>
        {card[0]}
        {suit.glyph}
      </text>
    </svg>
  )
}
