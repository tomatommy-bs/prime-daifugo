'use client'
/**
 * Wide table (spec §6.3, §7.6; catalogue §9.2 #8, #19, #26).
 *
 * Seats sit on an ellipse with `a = .42W`, `b = .34H`. Self is at θ = π/2 (bottom) and play
 * goes clockwise: `θₖ = π/2 + 2πk/n` (`seatAngle`). A turn radius runs from the centre to the
 * active seat and is spring-rotated along the shortest signed arc; a `--mod` arc points toward
 * the next seat. Behind the table, a faint sieve shimmers once on a prime play
 * (`shimmerKey`) and ripples outward from the winner at game end (`rippleFromId`).
 */
import { SieveGrid } from '@/design/SieveGrid'
import { ellipsePoint, seatAngle } from '@/design/math/geometry'
import { sieve } from '@/design/math/sieve'
import { DUR, EASE, SPRING, motionPreset, useMotionMode } from '@/design/motion'
import { m, useSpring, useTransform } from 'framer-motion'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { Seat } from './Seat'
import { observerSeats, playerSeats } from './seat-model'
import type { SeatModel } from './types'

export type SeatRingProps = {
  seats: SeatModel[]
  width: number
  height: number
  /** table centre (field, sequence) */
  children?: ReactNode
  /** change this value to shimmer the sieve once (a successful prime play) */
  shimmerKey?: string | number | null
  /** the winner's seat id: the seat flashes gold and the sieve ripples out from it */
  rippleFromId?: string | null
}

const RAD2DEG = 180 / Math.PI
/** turn radius and direction arc stop short of the seat nodes */
const RADIUS_INSET = 0.82
/** the radius starts outside the table centre so it never crosses the field cards */
const RADIUS_START = 0.62
const ARC_SCALE = 0.86
/** where the direction arc starts, as a fraction of the angle to the next seat */
export const ARC_FROM = 0.1
const SIEVE_CELL = 14

/** Ring geometry: semi-axes and the centre. */
export function ringGeometry(width: number, height: number) {
  return { a: 0.42 * width, b: 0.34 * height, cx: width / 2, cy: height / 2 }
}

/**
 * Next cumulative angle (degrees) that reaches `targetDeg` along the shortest signed arc
 * from `prevDeg`, so the radius never spins the long way round.
 */
export function shortestTurn(prevDeg: number, targetDeg: number): number {
  const delta = ((((targetDeg - prevDeg) % 360) + 540) % 360) - 180
  return prevDeg + delta
}

/** SVG path along the ellipse from θ₀ to θ₁ (radians), sampled. */
export function ellipseArcPath(a: number, b: number, t0: number, t1: number, steps = 24): string {
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps
    const p = ellipsePoint(a, b, t)
    pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
  }
  return pts.join(' ')
}

/** Arrowhead at the end of the direction arc, pointing along the tangent. */
function arrowHead(a: number, b: number, t: number, size = 6): string {
  const p = ellipsePoint(a, b, t)
  // tangent of (a cos t, b sin t) is (−a sin t, b cos t)
  const tx = -a * Math.sin(t)
  const ty = b * Math.cos(t)
  const len = Math.hypot(tx, ty) || 1
  const ux = tx / len
  const uy = ty / len
  const back = { x: p.x - ux * size, y: p.y - uy * size }
  const nx = -uy * size * 0.6
  const ny = ux * size * 0.6
  return `M${(back.x + nx).toFixed(2)} ${(back.y + ny).toFixed(2)} L${p.x.toFixed(2)} ${p.y.toFixed(2)} L${(back.x - nx).toFixed(2)} ${(back.y - ny).toFixed(2)}`
}

type Band = { band: number; cells: { x: number; y: number; s: number }[] }

/** Prime cells of the backdrop grouped in distance bands from an origin (grid px). */
function primeBands(
  cols: number,
  rows: number,
  cell: number,
  origin: { x: number; y: number },
  bands: number,
): Band[] {
  const flags = sieve(cols * rows)
  const inset = cell * 0.18
  const out: Band[] = Array.from({ length: bands }, (_, band) => ({ band, cells: [] }))
  const maxD =
    Math.hypot(
      Math.max(origin.x, cols * cell - origin.x),
      Math.max(origin.y, rows * cell - origin.y),
    ) || 1
  for (let i = 0; i < cols * rows; i++) {
    if (!flags[i + 1]) {
      continue
    }
    const x = (i % cols) * cell
    const y = Math.floor(i / cols) * cell
    const d = Math.hypot(x + cell / 2 - origin.x, y + cell / 2 - origin.y)
    const band = Math.min(bands - 1, Math.floor((d / maxD) * bands))
    out[band].cells.push({ x: x + inset, y: y + inset, s: cell - 2 * inset })
  }
  return out
}

/** One opacity wave over the backdrop's prime cells, by distance from `origin`. */
function SieveWave({
  cols,
  rows,
  origin,
  duration,
  color,
}: {
  cols: number
  rows: number
  origin: { x: number; y: number }
  duration: number
  color: string
}) {
  const BANDS = 8
  const bands = useMemo(
    () => primeBands(cols, rows, SIEVE_CELL, origin, BANDS),
    [cols, rows, origin],
  )
  const step = (duration * 0.6) / BANDS
  return (
    <svg
      aria-hidden="true"
      data-sieve-wave=""
      width={cols * SIEVE_CELL}
      height={rows * SIEVE_CELL}
      viewBox={`0 0 ${cols * SIEVE_CELL} ${rows * SIEVE_CELL}`}
      className="absolute inset-0"
    >
      {bands.map((b) => (
        <m.g
          key={b.band}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0] }}
          transition={{ duration: duration * 0.4, delay: b.band * step, ease: EASE.inOut }}
        >
          {b.cells.map((c) => (
            <rect
              key={`${c.x}-${c.y}`}
              x={c.x}
              y={c.y}
              width={c.s}
              height={c.s}
              rx={SIEVE_CELL * 0.08}
              fill={color}
            />
          ))}
        </m.g>
      ))}
    </svg>
  )
}

/** Remember the first value so a key only "fires" when it changes after mount. */
function useChangedSinceMount<T>(value: T): boolean {
  const initial = useRef(value)
  return value !== null && value !== undefined && value !== initial.current
}

export function SeatRing({
  seats,
  width,
  height,
  children,
  shimmerKey = null,
  rippleFromId = null,
}: SeatRingProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const preset = motionPreset(!full)
  const players = playerSeats(seats)
  const observers = observerSeats(seats)
  const n = Math.max(1, players.length)
  const { a, b, cx, cy } = ringGeometry(width, height)
  const active = players.find((s) => s.isActive) ?? null

  const placed = players.map((s) => {
    const theta = seatAngle(s.k, n)
    const p = ellipsePoint(a, b, theta)
    return { seat: s, theta, x: cx + p.x, y: cy + p.y }
  })

  // turn radius: a spring on the cumulative angle, projected onto the (inset) ellipse
  const targetDeg = active ? seatAngle(active.k, n) * RAD2DEG : null
  const cumulative = useRef<number>(targetDeg ?? 90)
  const angle = useSpring(cumulative.current, {
    visualDuration: SPRING.snap.visualDuration,
    bounce: SPRING.snap.bounce,
  })
  useEffect(() => {
    if (targetDeg === null) {
      return
    }
    const next = shortestTurn(cumulative.current, targetDeg)
    cumulative.current = next
    if (full) {
      angle.set(next)
    } else {
      angle.jump(next)
    }
  }, [targetDeg, full, angle])
  const x2 = useTransform(angle, (d) => a * RADIUS_INSET * Math.cos(d / RAD2DEG))
  const y2 = useTransform(angle, (d) => b * RADIUS_INSET * Math.sin(d / RAD2DEG))
  const x1 = useTransform(angle, (d) => a * RADIUS_START * Math.cos(d / RAD2DEG))
  const y1 = useTransform(angle, (d) => b * RADIUS_START * Math.sin(d / RAD2DEG))

  // direction arc toward the next seat (clockwise on screen = increasing θ)
  const arc =
    active && players.length > 1
      ? (() => {
          const t0 = seatAngle(active.k, n)
          const span = (2 * Math.PI) / n
          // starts right beside the active chip (0.2 of the span left it ~80px detached)
          const from = t0 + span * ARC_FROM
          const to = t0 + span * 0.8
          const aa = a * ARC_SCALE
          const bb = b * ARC_SCALE
          return { d: ellipseArcPath(aa, bb, from, to), head: arrowHead(aa, bb, to) }
        })()
      : null

  // backdrop sieve sized to the ellipse's inner box
  const boxW = Math.max(0, 2 * a * 0.9)
  const boxH = Math.max(0, 2 * b * 0.9)
  const cols = Math.max(1, Math.floor(boxW / SIEVE_CELL))
  const rows = Math.max(1, Math.floor(boxH / SIEVE_CELL))
  const gridW = cols * SIEVE_CELL
  const gridH = rows * SIEVE_CELL
  const gridLeft = cx - gridW / 2
  const gridTop = cy - gridH / 2

  const shimmer = useChangedSinceMount(shimmerKey) && full
  const winner = rippleFromId ? placed.find((p) => p.seat.id === rippleFromId) : undefined
  const winnerX = winner?.x ?? null
  const winnerY = winner?.y ?? null
  const rippleOrigin = useMemo(
    () =>
      winnerX !== null && winnerY !== null
        ? {
            x: Math.min(gridW, Math.max(0, winnerX - gridLeft)),
            y: Math.min(gridH, Math.max(0, winnerY - gridTop)),
          }
        : null,
    [winnerX, winnerY, gridLeft, gridTop, gridW, gridH],
  )
  const centreOrigin = useMemo(() => ({ x: gridW / 2, y: gridH / 2 }), [gridW, gridH])

  return (
    <div
      data-seat-ring=""
      data-motion={mode}
      data-active-k={active ? active.k : undefined}
      className="relative isolate"
      style={{ width, height }}
    >
      {/* backdrop: a faint sieve masked to the ellipse */}
      <div
        aria-hidden="true"
        data-sieve-backdrop=""
        className="pointer-events-none absolute"
        style={{
          left: gridLeft,
          top: gridTop,
          width: gridW,
          height: gridH,
          opacity: 0.7,
          maskImage: 'radial-gradient(ellipse closest-side, #000 55%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse closest-side, #000 55%, transparent 100%)',
        }}
      >
        <SieveGrid n={cols * rows} cols={cols} size={SIEVE_CELL} primeOpacity={0.25} />
        {shimmer ? (
          <SieveWave
            key={`shimmer-${String(shimmerKey)}`}
            cols={cols}
            rows={rows}
            origin={centreOrigin}
            duration={DUR.xl}
            color="var(--prime)"
          />
        ) : null}
        {full && rippleOrigin ? (
          <SieveWave
            key={`ripple-${rippleFromId}`}
            cols={cols}
            rows={rows}
            origin={rippleOrigin}
            duration={DUR.xxl}
            color="var(--gold)"
          />
        ) : null}
      </div>

      {/* ring geometry */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: 'visible' }}
      >
        <g transform={`translate(${cx} ${cy})`}>
          <ellipse rx={a} ry={b} fill="none" stroke="var(--line)" strokeWidth={1} />
          <ellipse
            rx={a * ARC_SCALE}
            ry={b * ARC_SCALE}
            fill="none"
            stroke="var(--line)"
            strokeWidth={0.75}
            strokeDasharray="1 5"
            strokeLinecap="round"
          />
          {placed.map(({ seat, theta }) => {
            const p0 = ellipsePoint(a * 0.96, b * 0.96, theta)
            const p1 = ellipsePoint(a * 1.04, b * 1.04, theta)
            return (
              <line
                key={seat.id}
                data-tick={seat.k}
                x1={p0.x}
                y1={p0.y}
                x2={p1.x}
                y2={p1.y}
                stroke={seat.isActive ? 'var(--mod)' : 'var(--border-strong)'}
                strokeWidth={seat.isActive ? 2 : 1}
                strokeLinecap="round"
              />
            )
          })}
          {active ? (
            // no end dot: it sat in empty space between the field and the seat
            <g data-turn-radius="">
              <m.line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--mod)"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </g>
          ) : null}
          {arc ? (
            <g key={active?.id} data-direction-arc="" fill="none" stroke="var(--mod)">
              <m.path
                d={arc.d}
                strokeWidth={1.5}
                strokeLinecap="round"
                variants={preset.drawLine}
                initial="hidden"
                animate="show"
              />
              <m.path
                d={arc.head}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: full ? DUR.md : 0, duration: DUR.sm }}
              />
            </g>
          ) : null}
        </g>
      </svg>

      {/* table centre */}
      <div
        data-ring-centre=""
        className="absolute flex flex-col items-center justify-center gap-fib-2"
        style={{
          left: cx - a * 0.7,
          top: cy - b * 0.7,
          width: a * 1.4,
          height: b * 1.4,
        }}
      >
        {children}
      </div>

      {/* seats */}
      <ol aria-label={`ℤ/${players.length}ℤ 手番順`} className="m-0 list-none p-0">
        {placed.map(({ seat, x, y }) => (
          // Centred with a plain CSS translate on the li: on the m.div itself, framer's
          // layout projection (layoutId, full motion) dropped the `-50%` and the node hung
          // off its point by half its size. Same split as the waiting-room seats.
          <li
            key={seat.id}
            data-k={seat.k}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: x, top: y }}
          >
            <m.div
              layoutId={full ? `seat-${seat.id}` : undefined}
              className="relative"
              variants={preset.seat}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              {winner?.seat.id === seat.id ? (
                <m.span
                  aria-hidden="true"
                  data-winner-flash=""
                  className="pointer-events-none absolute -inset-[4px] rounded-[var(--r-3)]"
                  style={{ boxShadow: '0 0 0 3px var(--gold)' }}
                  initial={full ? { opacity: 0 } : false}
                  animate={full ? { opacity: [0, 1, 0.2, 1] } : { opacity: 1 }}
                  transition={full ? { duration: DUR.xxl, ease: 'linear' } : { duration: 0 }}
                />
              ) : null}
              <Seat {...seat} layout="node" />
            </m.div>
          </li>
        ))}
      </ol>

      {observers.length > 0 ? (
        <ul
          aria-label="観戦"
          data-observers=""
          // boxed like the seat nodes, with its own label, instead of loose chips
          className="absolute top-0 left-0 m-0 flex list-none flex-wrap items-center gap-fib-1 rounded-[var(--r-3)] border border-line bg-surface px-fib-2 py-fib-1 shadow-[var(--shadow-1)]"
        >
          <li
            aria-hidden="true"
            className="pr-fib-1 font-semibold text-[length:var(--fs--1)] text-ink-muted"
          >
            観戦
          </li>
          {observers.map((s) => (
            <li key={s.id}>
              <Seat {...s} layout="chip" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
