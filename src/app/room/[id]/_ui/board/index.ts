/**
 * Board barrel (Foundation). Every board component and the shared contracts.
 * Import board pieces only through this module (`@/app/room/[id]/_ui/board`).
 */

// T1 cards
// biome-ignore lint/performance/noBarrelFile: the board barrel is the cross-task contract
export { Hand, type HandProps } from './Hand'
export { SubmitTray, type SubmitTrayProps } from './SubmitTray'
export { FactorPanel, type FactorPanelProps } from './FactorPanel'

// T2 table
export { Seat, type SeatProps } from './Seat'
export { SeatLine, type SeatLineProps } from './SeatLine'
export { SeatRing, type SeatRingProps } from './SeatRing'
export { TurnTimer, type TurnTimerProps } from './TurnTimer'
export { FieldStack, type FieldStackProps } from './FieldStack'
export { FieldSequence, type FieldSequenceProps } from './FieldSequence'
export { DeckPile, type DeckPileProps } from './DeckPile'
export { ResultOverlay, type ResultOverlayProps } from './ResultOverlay'
export { GrothendieckCut, type GrothendieckCutProps } from './GrothendieckCut'
export { GameSetDialog, type GameSetDialogProps } from './GameSetDialog'

// T3 board
export { BoardLayout, type BoardLayoutProps } from './BoardLayout'
export { ActionBar, type ActionBarProps } from './ActionBar'
export { ConnectionOverlay, type ConnectionOverlayProps } from './ConnectionOverlay'
export { ProofLog, type ProofLogProps } from './ProofLog'
export { LiveRegion, type LiveRegionProps } from './LiveRegion'

export type {
  BoardEvent,
  BoardEventType,
  ConnectionState,
  DrawDisabledReason,
  LayoutMode,
  LogEntry,
  SeatModel,
  SubmitResultCode,
  SubmitResultView,
} from './types'
