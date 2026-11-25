'use client'

import { ModRing } from '@/design/ModRing'
import { NumberGlyph } from '@/design/NumberGlyph'
import { DUR, EASE, SPRING, useMotionMode, useMotionPreset } from '@/design/motion'
import { useLayoutMode } from '@/design/use-layout-mode'
import type { PrimeDaifugoSetupData } from '@/interface/common'
import type * as serverToClient from '@/interface/server-to-client'
import { Button, SegmentedControl } from '@mantine/core'
import { IconArrowRight, IconCheck, IconX } from '@tabler/icons-react'
import { AnimatePresence, m } from 'framer-motion'
import { type FC, type ReactNode, useEffect, useRef, useState } from 'react'
import ClientRoomManager from '../room-manager'
import { RULE_ORDER, formatRuleValue } from './board/rule-diff'

interface Props {
  rule: PrimeDaifugoSetupData
  onChangeRule?: (rule: Partial<PrimeDaifugoSetupData>) => void
  presence: serverToClient.PresenceEvent['presence']
  myPresence?: serverToClient.PresenceEvent['presence'][number]
  onGameStart?: (args: PrimeDaifugoSetupData) => void
  onSetReady?: () => void
  onUnsetReady?: () => void
}

type PresenceEntry = serverToClient.PresenceEvent['presence'][number]
type RuleKey = keyof PrimeDaifugoSetupData

/** Players needed to start (mirrors `ClientRoomManager.canStartGame`, used for copy only). */
const MIN_READY = 2
const ICON = { stroke: 1.5, size: '1.25em' } as const
const CIRCLED = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨']
const residue = (k: number) => CIRCLED[k] ?? `(${k})`

/** Seat angle on the waiting ring: top = ⓪, clockwise, at least 4 residues (§7.4). */
export const waitingSeatAngle = (k: number, n: number) =>
  -Math.PI / 2 + (2 * Math.PI * k) / Math.max(n, 4)

/** Ring radius as a fraction of the ring box (R = side · 0.36). */
const RING_R = 0.36

type Flash = { n: number; from: string; to: string }

export const FLASH_HOLD_MS = 1600

/** Remembers which rule rows changed since the last render, for the highlight band (§9.2 #5). */
function useRuleFlashes(rule: PrimeDaifugoSetupData) {
  const prev = useRef(rule)
  const [flashes, setFlashes] = useState<Partial<Record<RuleKey, Flash>>>({})
  const timers = useRef<Partial<Record<RuleKey, number>>>({})

  useEffect(() => {
    const before = prev.current
    prev.current = rule
    const changed = RULE_ORDER.filter((k) => before[k] !== rule[k])
    if (changed.length === 0) {
      return
    }
    setFlashes((f) => {
      const next = { ...f }
      for (const k of changed) {
        next[k] = {
          n: (f[k]?.n ?? 0) + 1,
          from: formatRuleValue(k, before[k]),
          to: formatRuleValue(k, rule[k]),
        }
      }
      return next
    })
    // The band itself fades after 377 + 233 ms; the diff chip stays readable for 1.6 s.
    const hold = FLASH_HOLD_MS
    for (const k of changed) {
      window.clearTimeout(timers.current[k])
      timers.current[k] = window.setTimeout(() => {
        setFlashes((f) => {
          const next = { ...f }
          delete next[k]
          return next
        })
      }, hold)
    }
  }, [rule])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const id of Object.values(pending)) {
        window.clearTimeout(id)
      }
    }
  }, [])

  return flashes
}

export const WaitingRoom: FC<Props> = (props) => {
  const { rule, onChangeRule } = props
  const { presence, myPresence, onGameStart, onSetReady, onUnsetReady } = props
  const canStartGame = ClientRoomManager.canStartGame(presence)
  const layout = useLayoutMode()
  const motionMode = useMotionMode()
  const reduced = motionMode === 'reduced'
  const flashes = useRuleFlashes(rule)
  const stacked = layout === 'portrait'
  const compact = layout === 'compact'
  const isReady = myPresence?.status === 'ready'

  return (
    <div
      className="mx-auto grid w-full max-w-[987px] items-start gap-fib-4"
      style={{
        gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : 'minmax(0, 360px) minmax(0, 1fr)',
      }}
      data-layout={layout}
      data-motion={motionMode}
    >
      <section
        aria-labelledby="waiting-seats-title"
        className="flex flex-col items-center gap-fib-3 rounded-[var(--r-3)] p-fib-3"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <h2 id="waiting-seats-title" className="sr-only">
          プレイヤー
        </h2>
        <SeatRing presence={presence} selfId={myPresence?.id} compact={compact} />
        <ReadyBar presence={presence} canStart={canStartGame} />
        <div className="grid w-full grid-cols-2 gap-fib-2">
          {isReady ? (
            <Button variant="default" onClick={onUnsetReady} leftSection={<IconX {...ICON} />}>
              取消
            </Button>
          ) : (
            <Button
              variant="light"
              color="mod"
              onClick={onSetReady}
              leftSection={<IconCheck {...ICON} />}
            >
              準備OK
            </Button>
          )}
          <Button
            onClick={() => onGameStart?.(rule)}
            disabled={!canStartGame}
            rightSection={<IconArrowRight {...ICON} />}
          >
            ゲーム開始
          </Button>
        </div>
      </section>

      <m.section
        aria-labelledby="waiting-axioms-title"
        className="flex flex-col gap-fib-2 rounded-[var(--r-3)] p-fib-4"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-1)',
        }}
        exit={{ x: -24, opacity: 0, transition: { duration: DUR.md, ease: EASE.in } }}
      >
        <h2
          id="waiting-axioms-title"
          className="m-0 mb-fib-1 flex items-baseline gap-fib-2 font-bold"
          style={{ fontSize: 'var(--fs-1)', lineHeight: 1.236 }}
        >
          公理
          <span className="font-normal text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
            （ルール）
          </span>
        </h2>

        <AxiomRow
          ruleKey="timeLimit"
          label="制限時間"
          symbol={<>t ∈</>}
          unit="s"
          flash={flashes.timeLimit}
          reduced={reduced}
        >
          <SegmentedControl
            aria-label="制限時間"
            value={rule.timeLimit?.toString()}
            onChange={(value) => onChangeRule?.({ timeLimit: Number(value) })}
            data={[
              { label: '15', value: '15' },
              { label: '60', value: '60' },
              { label: '300', value: '300' },
            ]}
            {...SEGMENT}
          />
        </AxiomRow>

        <AxiomRow
          ruleKey="initNumCards"
          label="初期手札"
          symbol={
            <>
              |H<sub className="text-[0.7em]">0</sub>| ∈
            </>
          }
          unit="枚"
          flash={flashes.initNumCards}
          reduced={reduced}
        >
          <SegmentedControl
            aria-label="初期手札"
            value={rule.initNumCards?.toString()}
            onChange={(value) => onChangeRule?.({ initNumCards: Number(value) })}
            data={[
              { label: '4', value: '4' },
              { label: '8', value: '8' },
              { label: '11', value: '11' },
            ]}
            {...SEGMENT}
          />
        </AxiomRow>

        <AxiomRow
          ruleKey="maxSubmitNumCards"
          label="最大提出"
          symbol={
            <>
              k<sub className="text-[0.7em]">max</sub> ∈
            </>
          }
          unit="枚"
          flash={flashes.maxSubmitNumCards}
          reduced={reduced}
        >
          <SegmentedControl
            aria-label="最大提出"
            value={rule.maxSubmitNumCards?.toString()}
            onChange={(value) => onChangeRule?.({ maxSubmitNumCards: Number(value) })}
            data={[
              { label: '4', value: '4' },
              { label: '∞', value: '52' },
            ]}
            {...SEGMENT}
          />
        </AxiomRow>

        <AxiomRow
          ruleKey="halfEvenNumbers"
          label="偶数半減"
          symbol={<>2∤n (♥♦)</>}
          description="山札の偶数の枚数を半分にします"
          flash={flashes.halfEvenNumbers}
          reduced={reduced}
        >
          <SegmentedControl
            aria-label="偶数半減"
            value={rule.halfEvenNumbers ? 'on' : 'off'}
            onChange={(value) => onChangeRule?.({ halfEvenNumbers: value === 'on' })}
            data={[
              { label: 'OFF', value: 'off' },
              { label: 'ON', value: 'on' },
            ]}
            {...SEGMENT}
          />
        </AxiomRow>
      </m.section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Seat ring                                                           */
/* ------------------------------------------------------------------ */

function SeatRing({
  presence,
  selfId,
  compact,
}: {
  presence: PresenceEntry[]
  selfId?: string
  compact: boolean
}) {
  const slots = Math.max(presence.length, 4)
  const side = compact ? 'min(100%, 360px, max(176px, calc(100dvh - 210px)))' : 'min(100%, 360px)'

  return (
    <div className="relative mb-fib-5 aspect-square" style={{ width: side }}>
      <ModRing n={slots} size={360} className="absolute inset-0 h-full w-full" />
      <div
        aria-hidden="true"
        className="num pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-ink-muted"
      >
        <span style={{ fontSize: 'var(--fs-2)', lineHeight: 1 }}>ℤ/{slots}ℤ</span>
      </div>
      <ol aria-label={`座席（ℤ/${slots}ℤ）`} className="m-0 list-none p-0">
        <AnimatePresence initial={false}>
          {Array.from({ length: slots }, (_, k) => {
            const player = presence[k]
            const theta = waitingSeatAngle(k, slots)
            const style = {
              left: `${50 + RING_R * 100 * Math.cos(theta)}%`,
              top: `${50 + RING_R * 100 * Math.sin(theta)}%`,
            }
            return player ? (
              <SeatNode
                key={player.id}
                k={k}
                player={player}
                isSelf={player.id === selfId}
                style={style}
              />
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: an empty seat is identified by its residue
              <EmptySeat key={`empty-${k}`} k={k} style={style} />
            )
          })}
        </AnimatePresence>
      </ol>
    </div>
  )
}

type Position = { left: string; top: string }

function SeatNode({
  k,
  player,
  isSelf,
  style,
}: {
  k: number
  player: PresenceEntry
  isSelf: boolean
  style: Position
}) {
  const preset = useMotionPreset()
  const ready = player.status === 'ready'
  const status = ready ? '準備OK' : '準備中'

  return (
    <li
      className="absolute -translate-x-1/2 -translate-y-[22px]"
      style={style}
      aria-label={`${residue(k)} ${player.name}${isSelf ? '（あなた）' : ''} ${status}`}
      data-seat={player.id}
      data-ready={ready ? 'true' : 'false'}
      data-self={isSelf ? 'true' : undefined}
    >
      <m.div
        layoutId={`seat-${player.id}`}
        variants={preset.seat}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={preset.reduced ? { duration: DUR.sm } : SPRING.soft}
        className="flex flex-col items-center gap-fib-1"
      >
        <SeatGlyph ready={ready} isSelf={isSelf} reduced={preset.reduced} />
        <span
          className="flex items-center gap-fib-1 whitespace-nowrap font-semibold leading-tight"
          style={{ fontSize: 'var(--fs--1)' }}
          aria-hidden="true"
        >
          <span
            data-hue={k % 4}
            className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
            style={{ background: `var(--seat-${k % 4})` }}
          />
          <span className="num shrink-0 text-ink-muted">{residue(k)}</span>
          <span className="max-w-[6em] truncate">{player.name}</span>
          {/* inline, so the top seat's label never reaches the ring's centre caption */}
          {isSelf ? (
            <span
              className="shrink-0 rounded-[var(--r-1)] px-fib-1 font-semibold leading-tight"
              style={{
                color: 'var(--mod)',
                background: 'color-mix(in srgb, var(--mod) 12%, transparent)',
              }}
            >
              あなた
            </span>
          ) : null}
        </span>
      </m.div>
    </li>
  )
}

function EmptySeat({ k, style }: { k: number; style: Position }) {
  const preset = useMotionPreset()
  return (
    <li
      className="absolute -translate-x-1/2 -translate-y-[22px]"
      style={style}
      aria-label={`${residue(k)} 空席`}
      data-seat="empty"
    >
      <m.div
        variants={preset.seat}
        initial="hidden"
        animate="show"
        exit="exit"
        className="flex flex-col items-center gap-fib-1"
        aria-hidden="true"
      >
        <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden="true">
          <circle
            cx={22}
            cy={22}
            r={15}
            fill="var(--bg)"
            stroke="var(--border-strong)"
            strokeWidth={1.5}
            strokeDasharray="3 4"
          />
        </svg>
        <span className="whitespace-nowrap text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
          <span className="num mr-fib-1">{residue(k)}</span>(空席)
        </span>
      </m.div>
    </li>
  )
}

/** ● ready / ○ not ready, with a `--mod` halo for self (§7.4, §9.2 #4). */
function SeatGlyph({
  ready,
  isSelf,
  reduced,
}: {
  ready: boolean
  isSelf: boolean
  reduced: boolean
}) {
  const draw = (delay: number) =>
    reduced
      ? { initial: false as const }
      : {
          initial: { pathLength: 0 },
          animate: { pathLength: 1 },
          transition: { duration: DUR.md, ease: EASE.out, delay },
        }
  return (
    <svg
      width={44}
      height={44}
      viewBox="0 0 44 44"
      aria-hidden="true"
      data-glyph={ready ? 'ready' : 'idle'}
    >
      {isSelf ? (
        <>
          <circle
            data-halo=""
            cx={22}
            cy={22}
            r={21}
            fill="color-mix(in srgb, var(--mod) 14%, transparent)"
          />
          <circle
            cx={22}
            cy={22}
            r={20}
            fill="none"
            stroke="var(--mod)"
            strokeWidth={1}
            strokeOpacity={0.6}
          />
        </>
      ) : null}
      <circle
        cx={22}
        cy={22}
        r={15}
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth={1.5}
      />
      {ready ? (
        <>
          <m.circle
            cx={22}
            cy={22}
            r={15}
            fill="var(--mod)"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DUR.sm, delay: reduced ? 0 : DUR.md * 0.6 }}
          />
          <m.circle
            cx={22}
            cy={22}
            r={15}
            fill="none"
            stroke="var(--mod)"
            strokeWidth={2}
            transform="rotate(-90 22 22)"
            {...draw(0)}
          />
          <m.path
            d="M15.5 22.5l4.2 4.2 8.8-9"
            fill="none"
            stroke="var(--surface)"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...draw(DUR.md * 0.8)}
          />
        </>
      ) : null}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Ready bar                                                           */
/* ------------------------------------------------------------------ */

function ReadyBar({ presence, canStart }: { presence: PresenceEntry[]; canStart: boolean }) {
  const total = presence.length
  const ready = presence.filter((p) => p.status === 'ready').length
  const ticks = Math.max(total, MIN_READY)
  const reason = canStart
    ? 'ゲームを開始できます'
    : total < MIN_READY
      ? `${MIN_READY}人以上で開始`
      : `あと ${MIN_READY - ready} 人の準備で開始`

  return (
    <div className="flex w-full flex-col gap-fib-1">
      <div className="flex items-center gap-fib-2">
        <progress
          className="sr-only"
          aria-label="準備完了"
          aria-valuetext={`${total} 人中 ${ready} 人が準備OK`}
          value={ready}
          max={Math.max(total, 1)}
        />
        <span
          className="font-semibold text-ink-muted"
          style={{ fontSize: 'var(--fs--1)' }}
          aria-hidden="true"
        >
          準備
        </span>
        <span className="inline-flex items-baseline gap-[2px]" aria-hidden="true">
          <NumberGlyph value={ready} size={0} />
          <span className="num text-ink-muted">/{total}</span>
        </span>
        <span className="flex flex-1 items-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: ticks }, (_, i) => {
            const filled = i < ready
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: ticks are positional
                key={i}
                data-tick={filled ? 'filled' : 'empty'}
                className="relative h-[8px] flex-1 overflow-hidden rounded-[2px]"
                style={{
                  maxWidth: 34,
                  border: `1px ${i < total ? 'solid' : 'dashed'} var(--border-strong)`,
                  // the start threshold (2 players) gets a gap after it
                  marginRight: i === MIN_READY - 1 && ticks > MIN_READY ? 6 : undefined,
                }}
              >
                <m.span
                  className="absolute inset-0 block"
                  style={{ background: 'var(--mod)', originX: 0 }}
                  initial={false}
                  animate={{ scaleX: filled ? 1 : 0 }}
                  transition={SPRING.snap}
                />
              </span>
            )
          })}
        </span>
      </div>
      <p
        className="m-0 flex items-center gap-fib-1"
        style={{
          fontSize: 'var(--fs--1)',
          color: canStart ? 'var(--mod)' : 'var(--ink-muted)',
        }}
        data-can-start={canStart ? 'true' : 'false'}
      >
        {canStart ? <span aria-hidden="true">✓</span> : null}
        {reason}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Axioms                                                              */
/* ------------------------------------------------------------------ */

const SEGMENT = {
  size: 'sm',
  styles: {
    root: { background: 'var(--bg)' },
    label: {
      minHeight: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-mono), ui-monospace, monospace',
      fontVariantNumeric: 'tabular-nums slashed-zero',
      fontWeight: 700,
      paddingInline: 'var(--sp-3)',
    },
  },
} as const

function AxiomRow({
  ruleKey,
  label,
  symbol,
  unit,
  description,
  flash,
  reduced,
  children,
}: {
  ruleKey: RuleKey
  label: string
  symbol: ReactNode
  unit?: string
  description?: string
  flash?: Flash
  reduced: boolean
  children: ReactNode
}) {
  return (
    <div
      className="relative grid items-center gap-x-fib-3 rounded-[var(--r-2)] px-fib-2 py-fib-1"
      style={{ gridTemplateColumns: '6em minmax(0, 1fr)' }}
      data-rule={ruleKey}
      data-flash={flash ? 'true' : 'false'}
    >
      {flash ? (
        reduced ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[var(--r-2)]"
            style={{ background: 'color-mix(in srgb, var(--mod) 14%, transparent)' }}
          />
        ) : (
          <m.span
            key={flash.n}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[var(--r-2)]"
            style={{ background: 'color-mix(in srgb, var(--mod) 14%, transparent)', originX: 0 }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
            transition={{ duration: DUR.lg + DUR.md, times: [0, DUR.lg / (DUR.lg + DUR.md), 1] }}
          />
        )
      ) : null}
      <div className="relative flex flex-col leading-tight">
        <span className="font-semibold text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
          {label}
        </span>
        <span className="num whitespace-nowrap font-bold" style={{ fontSize: 'var(--fs-0)' }}>
          {symbol}
        </span>
      </div>
      <div className="relative flex min-w-0 flex-wrap items-center gap-fib-1">
        <span aria-hidden="true" className="num text-ink-muted" style={{ fontSize: 'var(--fs-2)' }}>
          {'{'}
        </span>
        {children}
        <span aria-hidden="true" className="num text-ink-muted" style={{ fontSize: 'var(--fs-2)' }}>
          {'}'}
        </span>
        {unit ? (
          <span className="num text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
            {unit}
          </span>
        ) : null}
        {flash ? (
          <m.span
            key={`chip-${flash.n}`}
            data-rule-diff=""
            className="num ml-auto rounded-[var(--r-1)] px-fib-1 font-semibold"
            style={{
              fontSize: 'var(--fs--1)',
              color: 'var(--mod)',
              background: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--mod) 40%, transparent)',
            }}
            initial={reduced ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: DUR.sm, ease: EASE.out }}
          >
            {flash.from} → {flash.to}
          </m.span>
        ) : null}
      </div>
      {description ? (
        <p
          className="relative col-span-2 m-0 mt-fib-1 text-ink-muted"
          style={{ fontSize: 'var(--fs--1)' }}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}
