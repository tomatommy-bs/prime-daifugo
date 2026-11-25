/**
 * Board barrel. Every board component, the seat model and the shared contracts: import
 * these through this module (`@/app/room/[id]/_ui/board`). The pure logic modules that only
 * the container and the gallery use (`classify-transition`, `use-board-director`,
 * `rule-diff`) are imported from their own files.
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
export { buildSeats, observerSeats, playerSeats } from './seat-model'
export { TurnTimer, type TurnTimerProps } from './TurnTimer'
export { FieldStack, type FieldStackProps } from './FieldStack'
export { FieldSequence, type FieldSequenceProps } from './FieldSequence'
export { DeckPile, type DeckPileProps } from './DeckPile'
export { ResultOverlay, type ResultOverlayProps } from './ResultOverlay'
export { GrothendieckCut, type GrothendieckCutProps } from './GrothendieckCut'
export { GameSetDialog, type GameSetDialogProps } from './GameSetDialog'
export { FlightLayer, type FlightLayerHandle, type FlightLayerProps } from './FlightLayer'
export { type FlightSpec, planFlights } from './flight-plan'

// T3 board
export { BoardLayout, type BoardLayoutProps, BoardTopBar } from './BoardLayout'
export { ActionBar, type ActionBarProps, useBoardShortcuts } from './ActionBar'
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
