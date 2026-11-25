'use client'
/**
 * Room chrome (§6.4, §7.4–§7.6): `ℤ/nℤ · Room 1234 [QR] [S|M|L] ◐ … ∴ ログ`, leaving room on
 * the right for the NavBurger affix (☰). During play on compact screens it collapses
 * (`collapsed`) into a `⋯` popover holding the same controls plus the value-chip toggle,
 * so the 36px top bar belongs to the SeatLine.
 *
 * `RoomChromeContext` lets the board (which only receives `{id, size, onLogNotification}`)
 * report its room status / player count and ask for the log toggle (`L`).
 */
import { IconTherefore } from '@/design/icons'
import {
  ActionIcon,
  Popover,
  SegmentedControl,
  Switch,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconDots, IconSunMoon } from '@tabler/icons-react'
import { createContext } from 'react'
import { QRButton } from './QRButton'

export type CardSize = 'S' | 'M' | 'L'

export type BoardInfo = {
  status: 'waiting' | 'playing' | 'waitingNextRound' | null
  /** players in the residue ring (ℤ/nℤ) */
  n: number
}

export type RoomChrome = {
  onBoardInfo?: (info: BoardInfo) => void
  toggleLog?: () => void
}

export const RoomChromeContext = createContext<RoomChrome>({})

/** per-viewer key for the hand value chips (§8.1) */
export const SHOW_VALUES_KEY = 'showCardValues'

export type RoomHeaderProps = {
  roomId: string
  url: string | null
  size: CardSize
  onSizeChange: (size: CardSize) => void
  onOpenLog?: () => void
  n?: number
  collapsed?: boolean
  /** open the QR popover on mount (page: `mode !== 'compact'`) */
  qrDefaultOpened?: boolean
}

const SIZES: CardSize[] = ['S', 'M', 'L']

function SizeControl({ size, onSizeChange }: Pick<RoomHeaderProps, 'size' | 'onSizeChange'>) {
  return (
    <SegmentedControl
      size="xs"
      aria-label="カードの大きさ"
      data={SIZES.map((s) => ({ value: s, label: <span className="num font-bold">{s}</span> }))}
      value={size}
      onChange={(v) => onSizeChange(v as CardSize)}
      color="ink"
      classNames={{ root: '!bg-bg ring-1 ring-line' }}
    />
  )
}

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true })
  const next = computed === 'dark' ? 'light' : 'dark'
  return (
    <Tooltip label={next === 'dark' ? 'ダークモード' : 'ライトモード'}>
      <ActionIcon
        variant="subtle"
        color="gray"
        size={44}
        aria-label="テーマを切り替える"
        onClick={() => setColorScheme(next)}
        className="text-ink"
      >
        <IconSunMoon size="1.25em" stroke={1.5} />
      </ActionIcon>
    </Tooltip>
  )
}

function RoomTitle({ roomId, n }: { roomId: string; n?: number }) {
  return (
    <h1 className="m-0 flex min-w-0 items-baseline gap-fib-2 text-[length:var(--fs-0)] font-bold leading-none">
      {n && n > 0 ? (
        <span className="num text-mod" aria-label={`${n}人`}>
          ℤ/{n}ℤ
        </span>
      ) : null}
      <span className="truncate">
        <span className="text-ink-muted font-semibold">Room </span>
        <span className="num" data-room-id="">
          {roomId}
        </span>
      </span>
    </h1>
  )
}

function LogButton({ onOpenLog, label }: { onOpenLog: () => void; label: boolean }) {
  return label ? (
    <button
      type="button"
      onClick={onOpenLog}
      className="flex h-[44px] items-center gap-fib-1 rounded-[var(--r-2)] px-fib-3 font-semibold text-ink hover:bg-surface"
    >
      <IconTherefore className="text-mod" />
      ログ
    </button>
  ) : (
    <ActionIcon variant="subtle" color="gray" size={44} aria-label="ログ" onClick={onOpenLog}>
      <IconTherefore className="text-mod" />
    </ActionIcon>
  )
}

export function RoomHeader({
  roomId,
  url,
  size,
  onSizeChange,
  onOpenLog,
  n,
  collapsed = false,
  qrDefaultOpened = false,
}: RoomHeaderProps) {
  const [showValues, setShowValues] = useLocalStorage<boolean>({
    key: SHOW_VALUES_KEY,
    defaultValue: false,
    getInitialValueInEffect: true,
  })

  if (collapsed) {
    return (
      <div
        data-room-header="collapsed"
        className="pointer-events-none fixed top-0 z-[150] flex h-[36px] items-center gap-fib-1"
        style={{ right: 'calc(max(var(--sp-3), env(safe-area-inset-right)) + 44px)' }}
      >
        <div className="pointer-events-auto flex items-center">
          {onOpenLog ? <LogButton onOpenLog={onOpenLog} label={false} /> : null}
          <Popover position="bottom-end" withArrow={true} shadow="md" hideDetached={false}>
            <Popover.Target>
              <ActionIcon variant="subtle" color="gray" size={44} aria-label="部屋メニュー">
                <IconDots size="1.25em" stroke={1.5} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown className="!border-line !bg-surface">
              <div className="flex w-[220px] flex-col gap-fib-3" data-room-menu="">
                <RoomTitle roomId={roomId} n={n} />
                <div className="flex items-center gap-fib-2">
                  {url ? <QRButton url={url} /> : null}
                  <SizeControl size={size} onSizeChange={onSizeChange} />
                </div>
                <Switch
                  label="カードの値を表示"
                  checked={showValues}
                  onChange={(e) => setShowValues(e.currentTarget.checked)}
                  color="mod"
                />
                <div className="flex items-center justify-between text-[length:var(--fs--1)] text-ink-muted">
                  テーマ
                  <ThemeToggle />
                </div>
              </div>
            </Popover.Dropdown>
          </Popover>
        </div>
      </div>
    )
  }

  return (
    <header
      data-room-header="full"
      className="flex h-[44px] min-w-0 items-center gap-fib-2 border-b border-line px-[max(var(--sp-3),env(safe-area-inset-left),env(safe-area-inset-right))] compact:h-[36px] wide:h-[52px]"
    >
      <RoomTitle roomId={roomId} n={n} />
      {url ? <QRButton url={url} popoverProps={{ defaultOpened: qrDefaultOpened }} /> : null}
      <SizeControl size={size} onSizeChange={onSizeChange} />
      <div className="flex-1" />
      <ThemeToggle />
      {onOpenLog ? <LogButton onOpenLog={onOpenLog} label={true} /> : null}
      {/* NavBurger (☰) is a fixed affix from the root layout: keep its slot free */}
      <div aria-hidden="true" className="w-[44px] shrink-0" data-slot="nav-burger" />
    </header>
  )
}
