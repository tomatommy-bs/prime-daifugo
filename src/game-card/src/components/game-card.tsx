import type { SVGAttributes, SVGProps } from 'react'
import { cardLabel } from '../tools/card-label'
import type { CardId } from '../tools/suit-num'
import { CourtCard, type CourtCardId, isCourtCard } from './court-faces'
import * as svgCards from './number-faces'

type NumberCardId = Exclude<CardId, CourtCardId>

/** Number cards, aces and the back are bundled; the 12 court faces (96% of the bytes) load lazily. */
const cardIdToModuleName: Record<NumberCardId | 'Back', keyof typeof svgCards> = {
  '2C': 'Svg2C',
  '2D': 'Svg2D',
  '2H': 'Svg2H',
  '2S': 'Svg2S',
  '3C': 'Svg3C',
  '3D': 'Svg3D',
  '3H': 'Svg3H',
  '3S': 'Svg3S',
  '4C': 'Svg4C',
  '4D': 'Svg4D',
  '4H': 'Svg4H',
  '4S': 'Svg4S',
  '5C': 'Svg5C',
  '5D': 'Svg5D',
  '5H': 'Svg5H',
  '5S': 'Svg5S',
  '6C': 'Svg6C',
  '6D': 'Svg6D',
  '6H': 'Svg6H',
  '6S': 'Svg6S',
  '7C': 'Svg7C',
  '7D': 'Svg7D',
  '7H': 'Svg7H',
  '7S': 'Svg7S',
  '8C': 'Svg8C',
  '8D': 'Svg8D',
  '8H': 'Svg8H',
  '8S': 'Svg8S',
  '9C': 'Svg9C',
  '9D': 'Svg9D',
  '9H': 'Svg9H',
  '9S': 'Svg9S',
  '10C': 'Svg10C',
  '10D': 'Svg10D',
  '10H': 'Svg10H',
  '10S': 'Svg10S',
  AC: 'Ac',
  AD: 'Ad',
  AH: 'Ah',
  AS: 'As',
  Back: 'Back',
} as const

export interface GameCardProps extends SVGProps<SVGSVGElement> {
  card: CardId | 'Back'
}

const HIDDEN_ROLES = new Set(['presentation', 'none'])

/**
 * A playing card face (or the back), sized by `fontSize` (1em = card height).
 * Defaults: `role="option"` and an `aria-label` from `cardLabel()` (e.g. `"ハートのJ, 11"`),
 * both overridable. Decorative uses (`role="presentation"` or `aria-hidden`) get no label.
 */
export const GameCard: React.FC<GameCardProps> = ({ card, ...props }) => {
  const role = props.role ?? 'option'
  const decorative =
    HIDDEN_ROLES.has(role) || props['aria-hidden'] === true || props['aria-hidden'] === 'true'
  const ariaLabel = props['aria-label'] ?? (decorative ? undefined : cardLabel(card))
  const className: SVGAttributes<SVGSVGElement>['className'] = props.className
    ? `select-none ${props.className}`
    : 'select-none'
  const svgProps = {
    ...props,
    role,
    'aria-label': ariaLabel,
    'data-card': card,
    className,
  } as SVGProps<SVGSVGElement>
  if (isCourtCard(card)) {
    // the placeholder carries the same role, label and data-card, so semantics never change
    return <CourtCard card={card} {...svgProps} />
  }
  return svgCards[cardIdToModuleName[card]](svgProps)
}
