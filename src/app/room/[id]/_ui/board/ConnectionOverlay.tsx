'use client'
/**
 * Connection states over the board (§7.7, §9.2 #28). The board stays mounted underneath and
 * is desaturated (`grayscale(.6)`, 377 ms) while not `open`:
 * - `connecting`: a spinning `ModRing n=12` with 接続中…
 * - `waiting-sync`: connected but no game state yet (server sync quirk) → 次のイベントを待っています…
 * - `closed` / `error`: a red `Alert role="alert"` 接続が切れました with [再接続].
 * A scrim veils the board and the status cards are opaque, so the board's own captions and
 * empty-field placeholder never show through or poke out beside the card.
 */
import { ModRing } from '@/design/ModRing'
import { useMotionPreset } from '@/design/motion'
import { Alert, Button } from '@mantine/core'
import { IconPlugConnectedX, IconRefresh } from '@tabler/icons-react'
import { AnimatePresence, m } from 'framer-motion'
import type { ReactNode } from 'react'
import type { ConnectionState } from './types'

export type ConnectionOverlayProps = {
  state: ConnectionState
  onReconnect?: () => void
  children: ReactNode
}

export function ConnectionOverlay({ state, onReconnect, children }: ConnectionOverlayProps) {
  const preset = useMotionPreset()
  const blocked = state !== 'open'
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
            key={state === 'waiting-sync' ? 'sync' : state}
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
            {state === 'closed' || state === 'error' ? (
              <Alert
                role="alert"
                color="red"
                variant="light"
                radius="lg"
                title="接続が切れました"
                icon={<IconPlugConnectedX stroke={1.5} />}
                className="pointer-events-auto w-full max-w-[377px] border border-danger/40 shadow-[var(--shadow-2)]"
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
