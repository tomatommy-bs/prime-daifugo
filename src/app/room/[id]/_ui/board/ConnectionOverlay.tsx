'use client'
/**
 * Connection states over the board (§7.7, §9.2 #28). The board stays mounted underneath and
 * is desaturated (`grayscale(.6)`, 377 ms) while not `open`:
 * - `connecting`: a spinning `ModRing n=12` with 接続中…
 * - `waiting-sync`: connected but no game state yet (server sync quirk) → 次のイベントを待っています…
 * - `closed` / `error`: a red `Alert role="alert"` 接続が切れました with [再接続].
 * - with `reason` (a terminal close, rebuild spec §9.4), `closed` / `error` instead show:
 *   - `superseded`: 別のタブで開かれています with [このタブで再開] (calls `onReconnect`);
 *   - `room-gone`: この部屋は閉じられました with a link home (`/`);
 *   - `left`: a neutral 退出しました card (no alert): the player chose to leave and the page is
 *     on its way home, so the red disconnect copy must not flash up.
 *   Any other reason keeps the default copy.
 * A scrim veils the board and the status cards are opaque, so the board's own captions and
 * empty-field placeholder never show through or poke out beside the card.
 */
import type { CloseReason } from '@/app/room/[id]/session/types'
import { ModRing } from '@/design/ModRing'
import { useMotionPreset } from '@/design/motion'
import { Alert, Button } from '@mantine/core'
import {
  IconAppWindow,
  IconDoorExit,
  IconHome,
  IconPlugConnectedX,
  IconRefresh,
} from '@tabler/icons-react'
import { AnimatePresence, m } from 'framer-motion'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { ConnectionState } from './types'

export type ConnectionOverlayProps = {
  state: ConnectionState
  onReconnect?: () => void
  /** why the session ended for good; changes the `closed` / `error` copy */
  reason?: CloseReason
  children: ReactNode
}

export const SUPERSEDED_TITLE = '別のタブで開かれています'
export const RESUME_HERE_LABEL = 'このタブで再開'
export const ROOM_GONE_TITLE = 'この部屋は閉じられました'
export const LEFT_TITLE = '退出しました'

const ALERT_CLASS =
  'pointer-events-auto w-full max-w-[377px] border border-danger/40 shadow-[var(--shadow-2)]'

export function ConnectionOverlay({
  state,
  onReconnect,
  reason = null,
  children,
}: ConnectionOverlayProps) {
  const preset = useMotionPreset()
  const blocked = state !== 'open'
  const closed = state === 'closed' || state === 'error'
  const terminal =
    closed && (reason === 'superseded' || reason === 'room-gone' || reason === 'left')
      ? reason
      : null
  return (
    <div
      className="relative h-full min-h-0 w-full"
      data-connection={state}
      data-motion={preset.mode}
      aria-busy={state === 'connecting' || state === 'waiting-sync' ? true : undefined}
    >
      <div
        data-board-surface="true"
        className={`h-full min-h-0 w-full transition-[filter] duration-[var(--t-lg)] ease-[var(--ease-out)] ${
          blocked && state !== 'waiting-sync' ? 'pointer-events-none select-none' : ''
        }`}
        style={{ filter: blocked ? 'grayscale(.6)' : 'none' }}
      >
        {children}
      </div>
      <AnimatePresence>
        {blocked ? (
          <m.div
            key={state === 'waiting-sync' ? 'sync' : (terminal ?? state)}
            variants={preset.fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            data-connection-scrim=""
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg/75 p-fib-4"
          >
            {state === 'connecting' ? (
              <output className="pointer-events-auto flex flex-col items-center gap-fib-3 rounded-[var(--r-3)] bg-surface px-fib-5 py-fib-4 text-ink shadow-[var(--shadow-2)]">
                <ModRing n={12} size={52} spin={true} filled={3} />
                <span className="text-[length:var(--fs-0)] font-semibold">接続中…</span>
              </output>
            ) : null}
            {state === 'waiting-sync' ? (
              <output className="pointer-events-auto flex items-center gap-fib-3 rounded-[var(--r-3)] border border-line bg-surface px-fib-4 py-fib-3 text-ink-muted shadow-[var(--shadow-1)]">
                <ModRing n={12} size={32} spin={true} filled={1} />
                <span className="text-[length:var(--fs-0)]">次のイベントを待っています…</span>
              </output>
            ) : null}
            {terminal === 'left' ? (
              <output
                className="pointer-events-auto flex items-center gap-fib-3 rounded-[var(--r-3)] border border-line bg-surface px-fib-4 py-fib-3 text-ink-muted shadow-[var(--shadow-1)]"
                data-close-reason="left"
              >
                <IconDoorExit size="1.25em" stroke={1.5} />
                <span className="text-[length:var(--fs-0)]">{LEFT_TITLE}</span>
              </output>
            ) : null}
            {terminal === 'superseded' ? (
              <Alert
                role="alert"
                color="red"
                variant="light"
                radius="lg"
                title={SUPERSEDED_TITLE}
                icon={<IconAppWindow stroke={1.5} />}
                className={ALERT_CLASS}
                data-close-reason="superseded"
              >
                <p className="mb-fib-3 text-ink-muted">
                  この部屋は別のタブ（または端末）で続いています。
                </p>
                <Button
                  color="red"
                  leftSection={<IconRefresh size="1.25em" stroke={1.5} />}
                  onClick={onReconnect}
                >
                  {RESUME_HERE_LABEL}
                </Button>
              </Alert>
            ) : null}
            {terminal === 'room-gone' ? (
              <Alert
                role="alert"
                color="red"
                variant="light"
                radius="lg"
                title={ROOM_GONE_TITLE}
                icon={<IconDoorExit stroke={1.5} />}
                className={ALERT_CLASS}
                data-close-reason="room-gone"
              >
                <p className="mb-fib-3 text-ink-muted">
                  新しい部屋を作るか、ホームから参加できます。
                </p>
                <Button
                  component={Link}
                  href="/"
                  color="red"
                  leftSection={<IconHome size="1.25em" stroke={1.5} />}
                >
                  ホームへ
                </Button>
              </Alert>
            ) : null}
            {closed && terminal === null ? (
              <Alert
                role="alert"
                color="red"
                variant="light"
                radius="lg"
                title="接続が切れました"
                icon={<IconPlugConnectedX stroke={1.5} />}
                className={ALERT_CLASS}
              >
                <p className="mb-fib-3 text-ink-muted">
                  {state === 'error'
                    ? 'サーバーに接続できませんでした。'
                    : 'サーバーとの接続が閉じられました。'}
                </p>
                <Button
                  color="red"
                  leftSection={<IconRefresh size="1.25em" stroke={1.5} />}
                  onClick={onReconnect}
                >
                  再接続
                </Button>
              </Alert>
            ) : null}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
