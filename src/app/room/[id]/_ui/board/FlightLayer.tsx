'use client'
/**
 * Card flights (§9.2 #7, #11, #19, #23–#25) as a measured FLIP:
 *
 * 1. **First** — `launch(plan)` is called from the socket handler *before* React renders the
 *    new state, so every source anchor (my tray card, a field card, the deck, a seat) is
 *    measured on the old DOM.
 * 2. **Last** — in a layout effect after the commit, every target anchor is measured on the
 *    new DOM, and real target cards get `data-flight-pending` (transparent, still clickable).
 * 3. **Play** — transform-only ghosts (x, y, rotate, scale, opacity) fly along a Bézier arc or
 *    a logarithmic spiral (`flightKeyframes`), then the real card is revealed.
 *
 * The layer is a fixed, `pointer-events: none` portal, so it never blocks input. Esc skips
 * every flight to its end state. Reduced motion: nothing flies (components crossfade).
 */
import {
  type FlightPath,
  type Point,
  type Rect,
  arcLift,
  fitSpiral,
  flightKeyframes,
  scaleKeyframes,
} from '@/design/math/geometry'
import { useReducedMotionSafe } from '@/design/motion'
import { GameCard } from '@/game-card/src'
import { m } from 'framer-motion'
import {
  type ForwardedRef,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { type FlightAnchor, type FlightFace, type FlightSpec, MAX_FLIGHTS } from './flight-plan'

export type FlightLayerHandle = {
  /** Measure the sources now (old DOM) and fly once the next commit has landed. */
  launch: (plan: FlightSpec[]) => void
  /** Jump every flight to its end state. */
  skip: () => void
}

export type FlightLayerProps = {
  /** disable without unmounting (tests, observers) */
  disabled?: boolean
}

/** Attribute that keeps a real card transparent until its ghost lands. */
export const PENDING_ATTR = 'data-flight-pending'
/** keyframe samples per flight */
const STEPS = 16
/** a ghost that never reports completion is removed after its length plus this (ms) */
const SAFETY_MS = 400
/** ghost height when neither end is a card (px) */
const DEFAULT_CARD_H = 72
/** the flip turns over the middle 40% of the flight, centred on the apex */
const FLIP_TIMES = [0, 0.3, 0.7, 1]
/** the flow sweep: up to three quarter turns, the radius shrinking by φ each (§9.2 #24);
 * fewer when the deck sits by an edge, so the sweep stays on screen */
const SPIRAL_TURNS = [0.75, 0.5, 0.25] as const
/** relative size a ghost shrinks to when absorbed by a seat */
const ABSORB_SCALE = 0.382

/** The CSS selector for an anchor. Ghosts live outside the board, so they never match. */
export function anchorSelector(a: FlightAnchor): string {
  switch (a.kind) {
    case 'deck':
      return '[data-anchor="deck"]'
    case 'seat':
      return `[data-seat-anchor="${cssEscape(a.id)}"]`
    case 'card':
      return `[data-card="${a.card}"]`
    case 'hand-card':
      return `[data-anchor="hand"] [data-card="${a.card}"]`
    case 'field-card':
      return `[data-field-top] [data-card="${a.card}"]`
    case 'cut-card':
      return `[data-cut-card="${a.card}"]`
    case 'field':
      return '[data-field-stack]'
    default:
      // 'hand'
      return '[data-anchor="hand"]'
  }
}

const cssEscape = (s: string) =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(s) : s

const isCardLike = (a: FlightAnchor) => a.kind !== 'seat' && a.kind !== 'field' && a.kind !== 'hand'

type Box = { c: Point; w: number; h: number; rotate: number; el: HTMLElement }

/** First on-screen element matching the anchor, with its centre, layout size and rotation. */
export function measureAnchor(a: FlightAnchor, root: ParentNode = document): Box | null {
  const els = root.querySelectorAll<HTMLElement>(anchorSelector(a))
  for (const el of els) {
    if (el.closest('[data-flight-layer]')) {
      continue
    }
    const face = el.querySelector<HTMLElement>('[data-face]') ?? el
    const r = face.getBoundingClientRect()
    if (r.width <= 0 && r.height <= 0) {
      continue
    }
    const rot = Number.parseFloat(getComputedStyle(el).rotate)
    return {
      c: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      // layout size: ignores entrance scales and the fan rotation's bounding box
      w: face.offsetWidth || r.width,
      h: face.offsetHeight || r.height,
      rotate: Number.isFinite(rot) ? rot : 0,
      el,
    }
  }
  return null
}

type Pending = { spec: FlightSpec; from: Box }

export type Ghost = {
  id: string
  spec: FlightSpec
  /** ghost box (px) */
  w: number
  h: number
  x: number[]
  y: number[]
  rotate: number[]
  scale: number[]
  times: number[]
  target: HTMLElement | null
}

/** Build the ghost for a measured flight (pure apart from the boxes). */
export function buildGhost(
  id: string,
  spec: FlightSpec,
  from: Omit<Box, 'el'>,
  to: Omit<Box, 'el'>,
  toCardLike: boolean,
  fromCardLike: boolean,
  /** the viewport: spirals turn the way that stays on screen */
  bounds: Rect = { x: 0, y: 0, w: 1e6, h: 1e6 },
): Ghost {
  const h = fromCardLike ? from.h : toCardLike ? to.h : DEFAULT_CARD_H
  const w = h * 0.69
  const d = Math.hypot(to.c.x - from.c.x, to.c.y - from.c.y)
  const path: FlightPath =
    spec.path === 'spiral'
      ? { kind: 'spiral', ...fitSpiral(from.c, to.c, bounds, SPIRAL_TURNS) }
      : // draws lift 40px (§9.2 #11); longer plays lift with their length
        { kind: 'arc', lift: spec.from.kind === 'deck' ? 40 : arcLift(d) }
  const k = flightKeyframes({
    from: from.c,
    to: to.c,
    path,
    steps: STEPS,
    ease: spec.ease,
    fromRotate: fromCardLike ? from.rotate : 0,
    toRotate: toCardLike && !spec.absorb ? to.rotate : 0,
  })
  const s0 = fromCardLike ? 1 : ABSORB_SCALE
  const s1 = toCardLike ? to.h / h : ABSORB_SCALE
  return {
    id,
    spec,
    w,
    h,
    ...k,
    scale: scaleKeyframes(s0, spec.absorb ? Math.min(s1, 1) * 0.8 : s1, STEPS, spec.ease),
    target: null,
  }
}

function Face({ card, h }: { card: FlightFace; h: number }) {
  return (
    <GameCard
      card={card}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      style={{ fontSize: h, display: 'block' }}
    />
  )
}

function GhostCard({ g, onDone }: { g: Ghost; onDone: (id: string) => void }) {
  const { spec } = g
  const flips = spec.face !== spec.faceTo
  const base = { duration: spec.duration, delay: spec.delay, ease: 'linear' as const }
  return (
    <m.div
      data-flight={spec.key}
      data-flight-path={spec.path}
      className="absolute"
      style={{
        left: -g.w / 2,
        top: -g.h / 2,
        width: g.w,
        height: g.h,
        willChange: 'transform',
        borderRadius: 'min(var(--r-2), 6%)',
        boxShadow: 'var(--shadow-2)',
      }}
      initial={{ x: g.x[0], y: g.y[0], rotate: g.rotate[0], scale: g.scale[0], opacity: 1 }}
      animate={{
        x: g.x,
        y: g.y,
        rotate: g.rotate,
        scale: g.scale,
        opacity: spec.absorb ? [1, 1, 0] : 1,
      }}
      transition={{
        ...base,
        times: g.times,
        opacity: spec.absorb ? { ...base, times: [0, 0.75, 1] } : { duration: 0 },
      }}
      onAnimationComplete={() => onDone(g.id)}
    >
      {flips ? (
        // a real rotateY 180 → 0 flip around the apex (§9.2 #7, #11): the take-off face is
        // the back side of the flipper, the landing face its front (transform only)
        <m.div
          data-flip=""
          className="relative h-full w-full"
          style={{ transformStyle: 'preserve-3d', transformPerspective: 600 }}
          initial={{ rotateY: 180 }}
          animate={{ rotateY: [180, 180, 0, 0] }}
          transition={{ ...base, times: FLIP_TIMES }}
        >
          <div
            className="absolute inset-0"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <Face card={spec.face} h={g.h} />
          </div>
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
            <Face card={spec.faceTo} h={g.h} />
          </div>
        </m.div>
      ) : (
        <Face card={spec.face} h={g.h} />
      )}
    </m.div>
  )
}

let nextId = 0

function FlightLayerImpl(
  { disabled = false }: FlightLayerProps,
  ref: ForwardedRef<FlightLayerHandle>,
) {
  const reduced = useReducedMotionSafe()
  const off = disabled || reduced
  const pending = useRef<Pending[]>([])
  const [launches, setLaunches] = useState(0)
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  const ghostsRef = useRef<Ghost[]>([])
  ghostsRef.current = ghosts
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const finish = useCallback((id: string) => {
    const g = ghostsRef.current.find((x) => x.id === id)
    g?.target?.removeAttribute(PENDING_ATTR)
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
    setGhosts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const skip = useCallback(() => {
    pending.current = []
    for (const g of ghostsRef.current) {
      g.target?.removeAttribute(PENDING_ATTR)
    }
    for (const t of timers.current.values()) {
      clearTimeout(t)
    }
    timers.current.clear()
    setGhosts([])
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      launch: (plan) => {
        if (off || typeof document === 'undefined') {
          return
        }
        const measured: Pending[] = []
        for (const spec of plan.slice(0, MAX_FLIGHTS)) {
          const from = measureAnchor(spec.from)
          if (from) {
            measured.push({ spec, from })
          }
        }
        if (measured.length > 0) {
          pending.current.push(...measured)
          setLaunches((n) => n + 1)
        }
      },
      skip,
    }),
    [off, skip],
  )

  // Last: measure targets on the committed DOM, hide real target cards, start the ghosts
  // (a layout effect, so the hidden targets and the ghosts share the first painted frame).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per launch
  useLayoutEffect(() => {
    if (pending.current.length === 0) {
      return
    }
    const batch = pending.current
    pending.current = []
    const room = Math.max(0, MAX_FLIGHTS - ghostsRef.current.length)
    const next: Ghost[] = []
    for (const { spec, from } of batch.slice(0, room)) {
      let toAnchor = spec.to
      let to = measureAnchor(spec.to)
      if (!to && spec.fallback) {
        toAnchor = spec.fallback
        to = measureAnchor(spec.fallback)
      }
      if (!to) {
        continue
      }
      const id = `f${nextId++}`
      const g = buildGhost(id, spec, from, to, isCardLike(toAnchor), isCardLike(spec.from), {
        x: 0,
        y: 0,
        w: window.innerWidth,
        h: window.innerHeight,
      })
      if (spec.hideTarget && isCardLike(toAnchor)) {
        to.el.setAttribute(PENDING_ATTR, '')
        g.target = to.el
      }
      next.push(g)
      timers.current.set(
        id,
        setTimeout(() => finish(id), (spec.delay + spec.duration) * 1000 + SAFETY_MS),
      )
    }
    if (next.length > 0) {
      setGhosts((prev) => [...prev, ...next])
    }
  }, [launches])

  useEffect(() => {
    if (ghosts.length === 0) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ghosts.length, skip])

  useEffect(() => {
    if (off) {
      skip()
    }
  }, [off, skip])

  // never leave a card transparent behind
  useEffect(() => () => skip(), [skip])

  if (ghosts.length === 0 || typeof document === 'undefined') {
    return null
  }
  return createPortal(
    <div
      data-flight-layer=""
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
    >
      {ghosts.map((g) => (
        <GhostCard key={g.id} g={g} onDone={finish} />
      ))}
    </div>,
    document.body,
  )
}

export const FlightLayer = forwardRef(FlightLayerImpl)
FlightLayer.displayName = 'FlightLayer'
