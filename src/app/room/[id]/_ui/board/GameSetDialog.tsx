'use client'
/**
 * GAME SET (spec §6.3, §7.7; catalogue §9.2 #26, #27).
 *
 *   Theorem.  bob の勝ち。
 *   Proof.    |H_bob| = 0.
 *   ─────────────
 *   standings                       Q.E.D. ∎
 *   [ 次のラウンドを開始 → ]
 *
 * The modal enters with `scale .96 → 1, y 8 → 0`; the `Q.E.D. ∎` stamp lands on the bounce
 * spring. Tap or Esc skips straight to the final state. The CTA calls `onNextRound`.
 */
import { DUR, SPRING, motionPreset, useMotionMode } from '@/design/motion'
import { Button, type MantineTransition, Modal } from '@mantine/core'
import { m } from 'framer-motion'
import { useEffect, useState } from 'react'

export type GameSetDialogProps = {
  opened: boolean
  winner: string | null
  standings: { name: string; handCount: number }[]
  /** number of plays this round */
  plays?: number
  onNextRound: () => void
  canStart?: boolean
}

export const NEXT_ROUND_LABEL = '次のラウンドを開始'
export const QED = 'Q.E.D. ∎'

/**
 * Modal exit (§9.2 #27, 233 ms ease-in), mirroring the entrance. The entrance itself is
 * played by framer-motion on mount, so the dialog content exists from the first frame.
 */
const EXIT: MantineTransition = {
  in: { opacity: 1, transform: 'translateY(0) scale(1)' },
  out: { opacity: 0, transform: 'translateY(8px) scale(.96)' },
  transitionProperty: 'transform, opacity',
}

/** Standings sorted by cards left (the winner, with 0, first); ties keep their order. */
export function sortStandings(standings: GameSetDialogProps['standings']) {
  return standings
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => a.handCount - b.handCount || a.i - b.i)
    .map(({ i: _i, ...s }) => s)
}

export function GameSetDialog({
  opened,
  winner,
  standings,
  plays,
  onNextRound,
  canStart = true,
}: GameSetDialogProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const preset = motionPreset(!full)
  const [skipped, setSkipped] = useState(false)
  // Mount the Modal already open (Mantine then renders it immediately) and keep it mounted
  // through its exit transition after `opened` turns false.
  const [present, setPresent] = useState(opened)
  useEffect(() => {
    if (opened) {
      setPresent(true)
    }
  }, [opened])

  useEffect(() => {
    if (!opened) {
      setSkipped(false)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSkipped(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opened])

  const animated = full && !skipped
  const rows = sortStandings(standings)
  const who = winner ?? '—'

  if (!(opened || present)) {
    return null
  }

  return (
    <Modal
      opened={opened}
      onClose={() => setSkipped(true)}
      onExitTransitionEnd={() => setPresent(false)}
      size={610}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      trapFocus={true}
      title={
        <span
          className="num font-bold tracking-[0.2em]"
          style={{ fontSize: 'var(--fs--1)', color: 'var(--ink-muted)' }}
        >
          GAME SET
        </span>
      }
      transitionProps={
        full
          ? { transition: EXIT, duration: DUR.md * 1000, timingFunction: 'var(--ease-in)' }
          : { transition: 'fade', duration: DUR.sm * 1000 }
      }
      styles={{
        content: { background: 'var(--surface-raised)', boxShadow: 'var(--shadow-2)' },
        header: { background: 'var(--surface-raised)', paddingBottom: 0 },
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-skip; Esc (window listener) is the keyboard path */}
      <m.div
        // §9.2 #26: the modal enters with scale .96 → 1, y 8 → 0 on the soft spring
        initial={full ? { opacity: 0, scale: 0.96, y: 8 } : { opacity: 0 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={full ? SPRING.soft : { duration: DUR.sm }}
        data-game-set=""
        data-motion={mode}
        data-skipped={skipped ? 'true' : undefined}
        className="relative flex flex-col gap-fib-4 pb-fib-2 compact:gap-fib-2 compact:pb-0"
        onClick={() => setSkipped(true)}
      >
        <dl
          className="m-0 grid items-baseline gap-x-fib-4 gap-y-fib-2"
          style={{ gridTemplateColumns: 'auto 1fr', fontSize: 'var(--fs-1)' }}
        >
          <dt className="font-bold italic">Theorem.</dt>
          <dd className="m-0" data-theorem="">
            <span className="font-bold" style={{ color: 'var(--gold)' }}>
              {who}
            </span>{' '}
            の勝ち。
          </dd>
          <dt className="font-bold italic">Proof.</dt>
          <dd className="num m-0" data-proof="">
            |H<sub style={{ fontSize: 'var(--fs--2)' }}>{who}</sub>| = 0.
          </dd>
        </dl>

        <m.hr
          aria-hidden="true"
          className="m-0 h-px w-2/5 border-0"
          style={{ background: 'var(--border-strong)', originX: 0 }}
          initial={animated ? { scaleX: 0 } : false}
          animate={{ scaleX: 1 }}
          transition={animated ? { duration: DUR.md, delay: DUR.md } : { duration: 0 }}
        />

        <div className="flex items-end justify-between gap-fib-4">
          <table className="num border-collapse" style={{ fontSize: 'var(--fs--1)' }}>
            <caption className="sr-only">残り手札</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">プレイヤー</th>
                <th scope="col">残り手札</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const isWinner = s.name === winner
                return (
                  <tr
                    key={s.name}
                    data-standing={s.name}
                    data-winner={isWinner ? 'true' : undefined}
                  >
                    <th
                      scope="row"
                      className="py-[2px] pr-fib-4 text-left font-semibold"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        color: isWinner ? 'var(--gold)' : 'var(--ink)',
                      }}
                    >
                      {s.name}
                    </th>
                    <td
                      className="py-[2px] text-right font-bold tabular-nums"
                      style={{ color: isWinner ? 'var(--gold)' : 'var(--ink-muted)' }}
                    >
                      {s.handCount}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <m.span
            key={skipped ? 'final' : 'stamp'}
            data-qed=""
            // the --fs-6 stamp, one step down on a 390px-tall phone so the CTA stays in view
            className="num block select-none whitespace-nowrap font-bold text-[length:var(--fs-6)] leading-none compact:text-[length:var(--fs-4)]"
            style={{ color: 'var(--gold)' }}
            variants={full ? preset.stamp : preset.fadeUp}
            initial={animated ? 'hidden' : false}
            animate="show"
            transition={animated ? { ...SPRING.bounce, delay: DUR.xl } : undefined}
          >
            {QED}
          </m.span>
        </div>

        {plays !== undefined ? (
          <p className="m-0" style={{ fontSize: 'var(--fs--1)', color: 'var(--ink-muted)' }}>
            証明の長さ: <span className="num">{plays}</span> 手
          </p>
        ) : null}

        <Button
          size="lg"
          fullWidth={true}
          disabled={!canStart}
          onClick={onNextRound}
          styles={{ root: { minHeight: 55 } }}
        >
          {NEXT_ROUND_LABEL} →
        </Button>
      </m.div>
    </Modal>
  )
}
