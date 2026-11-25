/**
 * Wire protocol (spec §6): JSON over WebSocket plus the bare text frames `ping`/`pong`.
 * Zod schemas are the source of truth; every type is inferred from them.
 *
 * Frozen contract (foundation). Used by the Worker host (T3), the session reducer (T2), the
 * client session layer (T4) and the lobby hook (T7).
 */
import type { FactCardId, PrimeDaifugoSetupData } from '@/interface/common'
import { z } from 'zod'
import type { SubmitResultCode as EngineSubmitResultCode } from '../game/types'
import {
  CARD_IDS,
  CLOSE,
  type CardId,
  type CloseCode,
  PV,
  type Pid,
  SID_RE,
  TERMINAL_CLOSE_CODES,
} from './ids'

export { CLOSE, PV, TERMINAL_CLOSE_CODES }
export type { CardId, CloseCode, Pid }

/** Frames larger than this (UTF-8 bytes) get `bye{protocol}` (spec §6.4). */
export const MAX_FRAME_BYTES = 8192
/** Max length of a client request id. */
export const MAX_CMD_ID_LENGTH = 32
/** Max cards in a submit (52) and tokens in a factor expression (64). */
export const MAX_SUBMIT_CARDS = 52
export const MAX_FACTOR_TOKENS = 64

export const PING = 'ping'
export const PONG = 'pong'

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const seqNumber = z.number().int().nonnegative()

export const PidSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)
export const CardIdSchema = z.enum(CARD_IDS)
export const FactCardIdSchema = z.union([CardIdSchema, z.literal('*'), z.literal('^')])

export const RoomStatusSchema = z.enum(['waiting', 'playing', 'waitingNextRound'])
export type RoomStatus = z.infer<typeof RoomStatusSchema>

export const RoleSchema = z.enum(['player', 'observer'])
export type Role = z.infer<typeof RoleSchema>

/** A full rule as carried in views and events (allowed values are enforced by the reducer). */
export const RuleSchema = z.object({
  initNumCards: z.number().int(),
  maxSubmitNumCards: z.number().int(),
  timeLimit: z.number().int(),
  halfEvenNumbers: z.boolean(),
})

/** A `set-rule` patch. Shape only; allowed values are checked with `parseRulePatch` → `bad-rule`. */
export const RulePatchSchema = RuleSchema.partial().strict()

export const SubmitResultCodeSchema = z.enum([
  'BASE_IS_NOT_PRIME',
  'INVALID_FACT',
  'FACT_CONTAIN_NOT_PRIME',
  'INCORRECT_ANSWER',
])
/** `INVALID_FACT` is kept for UI type compatibility; the server never emits it. */
export type SubmitResultCode = z.infer<typeof SubmitResultCodeSchema>

export const RejectReasonSchema = z.enum([
  'not-your-turn',
  'stale',
  'bad-status',
  'invalid-move',
  'invalid-fact',
  'deck-empty',
  'already-drawn',
  'not-enough-ready',
  'bad-rule',
  'not-member',
  'rate-limited',
])
export type RejectReason = z.infer<typeof RejectReasonSchema>

export const ByeReasonSchema = z.enum([
  'superseded',
  'left',
  'room-full',
  'bad-name',
  'protocol',
  'upgrade-required',
  'room-gone',
])
export type ByeReason = z.infer<typeof ByeReasonSchema>

/** Close code that accompanies each `bye` reason. */
export const BYE_CLOSE_CODE: Record<ByeReason, number> = {
  superseded: CLOSE.superseded,
  left: CLOSE.left,
  'room-full': CLOSE['room-full'],
  'bad-name': CLOSE['bad-name'],
  protocol: CLOSE.protocol,
  'upgrade-required': CLOSE['upgrade-required'],
  'room-gone': CLOSE['room-gone'],
}

/* ------------------------------------------------------------------ */
/* Client → server (spec §6.1)                                         */
/* ------------------------------------------------------------------ */

export const HelloSchema = z.object({
  t: z.literal('hello'),
  pv: z.number().int(),
  sid: z.string().regex(SID_RE),
  /** validated by the reducer with `isValidName` (→ `bye{bad-name}`) */
  name: z.string().max(64),
  lastSeq: seqNumber.nullable(),
  epoch: z.string().max(64).nullable(),
})
export type Hello = z.infer<typeof HelloSchema>

export const CmdSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('unready') }),
  z.object({ type: z.literal('set-rule'), rule: RulePatchSchema }),
  z.object({ type: z.literal('start'), expectedVersion: seqNumber }),
  z.object({ type: z.literal('draw'), turn: seqNumber }),
  z.object({ type: z.literal('pass'), turn: seqNumber }),
  z.object({
    type: z.literal('submit'),
    turn: seqNumber,
    submit: z.array(CardIdSchema).max(MAX_SUBMIT_CARDS),
    factor: z.array(FactCardIdSchema).max(MAX_FACTOR_TOKENS),
  }),
  z.object({ type: z.literal('leave') }),
])
export type Cmd = z.infer<typeof CmdSchema>
export type CmdType = Cmd['type']

export const CmdFrameSchema = z.object({
  t: z.literal('cmd'),
  id: z.string().min(1).max(MAX_CMD_ID_LENGTH),
  c: CmdSchema,
})
export type CmdFrame = z.infer<typeof CmdFrameSchema>

export const ClientFrameSchema = z.discriminatedUnion('t', [HelloSchema, CmdFrameSchema])
export type ClientFrame = z.infer<typeof ClientFrameSchema>

/* ------------------------------------------------------------------ */
/* View (spec §6.3)                                                    */
/* ------------------------------------------------------------------ */

export const ViewMemberSchema = z.object({
  id: PidSchema,
  name: z.string(),
  ready: z.boolean(),
  role: RoleSchema,
  connected: z.boolean(),
})
export type ViewMember = z.infer<typeof ViewMemberSchema>

export const ViewGameSchema = z.object({
  round: z.number().int(),
  turn: z.number().int(),
  playOrder: z.array(PidSchema),
  currentPlayer: PidSchema,
  players: z.record(PidSchema, z.object({ handCount: z.number().int(), drawRight: z.boolean() })),
  /** the viewer's own hand; `[]` for observers */
  hand: z.array(CardIdSchema),
  field: z.array(z.array(CardIdSchema)),
  deckCount: z.number().int(),
  deckTopPlayer: PidSchema.nullable(),
  /** epoch ms; null only when status !== 'playing' */
  deadline: z.number().nullable(),
  winner: z.object({ id: PidSchema, name: z.string() }).nullable(),
  lastResult: SubmitResultCodeSchema.nullable(),
})
export type ViewGame = z.infer<typeof ViewGameSchema>

export const ViewSchema = z.object({
  roomId: z.string(),
  status: RoomStatusSchema,
  rule: RuleSchema,
  version: seqNumber,
  /** sorted by joinedAt */
  members: z.array(ViewMemberSchema),
  game: ViewGameSchema.nullable(),
})
export type View = z.infer<typeof ViewSchema>

/* ------------------------------------------------------------------ */
/* Events (spec §6.2)                                                  */
/* ------------------------------------------------------------------ */

export const RoomEventSchema = z.discriminatedUnion('type', [
  /** join, reconnect, disconnect, removal; `view.members` is the truth */
  z.object({ type: z.literal('presence') }),
  z.object({ type: z.literal('ready-changed'), by: PidSchema, ready: z.boolean() }),
  z.object({ type: z.literal('rule-changed'), by: PidSchema, rule: RuleSchema }),
  z.object({ type: z.literal('game-started'), by: PidSchema, round: z.number().int() }),
  z.object({ type: z.literal('drew'), by: PidSchema }),
  z.object({
    type: z.literal('passed'),
    by: PidSchema,
    reason: z.enum(['manual', 'timeout']),
    flowed: z.boolean(),
  }),
  z.object({
    type: z.literal('submitted'),
    by: PidSchema,
    submit: z.array(CardIdSchema),
    factor: z.array(FactCardIdSchema),
    result: SubmitResultCodeSchema.nullable(),
    cut57: z.boolean(),
    flowed: z.boolean(),
    penalty: z.number().int(),
  }),
  z.object({ type: z.literal('forfeited'), pid: PidSchema, reason: z.enum(['grace', 'leave']) }),
  z.object({
    type: z.literal('game-ended'),
    winnerId: PidSchema,
    winnerName: z.string(),
    reason: z.enum(['empty-hand', 'last-standing']),
  }),
  z.object({ type: z.literal('member-left'), pid: PidSchema, name: z.string() }),
])
export type RoomEvent = z.infer<typeof RoomEventSchema>
export type RoomEventType = RoomEvent['type']

/* ------------------------------------------------------------------ */
/* Server → client (spec §6.2)                                         */
/* ------------------------------------------------------------------ */

export const WelcomeModeSchema = z.enum(['snapshot', 'replay', 'current'])
export type WelcomeMode = z.infer<typeof WelcomeModeSchema>

/**
 * - `snapshot`: `snap` present.
 * - `replay`: followed immediately by `evt` frames `lastSeq+1..seq`.
 * - `current`: nothing follows.
 */
export const WelcomeSchema = z.object({
  t: z.literal('welcome'),
  pv: z.number().int(),
  selfId: PidSchema,
  epoch: z.string(),
  serverNow: z.number(),
  mode: WelcomeModeSchema,
  seq: seqNumber,
  snap: ViewSchema.optional(),
})
export type Welcome = z.infer<typeof WelcomeSchema>

/** `snap` is the viewer's view of the post-state. */
export const EvtSchema = z.object({
  t: z.literal('evt'),
  seq: seqNumber,
  serverNow: z.number(),
  e: RoomEventSchema,
  snap: ViewSchema,
})
export type Evt = z.infer<typeof EvtSchema>

export const AckSchema = z.union([
  z.object({ t: z.literal('ack'), id: z.string(), ok: z.literal(true), seq: seqNumber }),
  z.object({
    t: z.literal('ack'),
    id: z.string(),
    ok: z.literal(false),
    reason: RejectReasonSchema,
  }),
])
export type Ack = z.infer<typeof AckSchema>

export const ByeSchema = z.object({ t: z.literal('bye'), reason: ByeReasonSchema })
export type Bye = z.infer<typeof ByeSchema>

/** Lobby broadcast (spec §8.2): `lobby` = sockets on the home page, `room` = connected members per room. */
export const LobbyStatsSchema = z.object({
  t: z.literal('lobby'),
  lobby: z.number().int().nonnegative(),
  room: z.record(z.string(), z.number().int().nonnegative()),
})
export type LobbyStats = z.infer<typeof LobbyStatsSchema>

/** Frames a room socket can receive. */
export const RoomServerFrameSchema = z.union([WelcomeSchema, EvtSchema, AckSchema, ByeSchema])
export type RoomServerFrame = z.infer<typeof RoomServerFrameSchema>

/** Every server frame, room or lobby. */
export const ServerFrameSchema = z.union([RoomServerFrameSchema, LobbyStatsSchema])
export type ServerFrame = z.infer<typeof ServerFrameSchema>

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** UTF-8 byte length of `text`, stopping early once it exceeds `limit`. */
export function utf8Length(text: string, limit = Number.POSITIVE_INFINITY): number {
  let bytes = 0
  for (let i = 0; i < text.length && bytes <= limit; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      text.charCodeAt(i + 1) >= 0xdc00 &&
      text.charCodeAt(i + 1) <= 0xdfff
    ) {
      // surrogate pair → one 4-byte code point
      bytes += 4
      i += 1
    } else {
      bytes += 3
    }
  }
  return bytes
}

export type ParseFailure = { ok: false; error: 'too-large' | 'not-json' | 'schema' }
export type ParseResult<T> = { ok: true; frame: T } | ParseFailure

function parseWith<T>(schema: z.ZodType<T>, text: string, maxBytes: number): ParseResult<T> {
  if (text.length > maxBytes || utf8Length(text, maxBytes) > maxBytes) {
    return { ok: false, error: 'too-large' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not-json' }
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? { ok: true, frame: parsed.data } : { ok: false, error: 'schema' }
}

/**
 * Parse a client → server text frame. The bare `ping` text frame is not JSON and is answered by
 * the runtime's auto-response; callers should handle it before calling this.
 */
export function parseClientFrame(text: string): ParseResult<ClientFrame> {
  return parseWith(ClientFrameSchema, text, MAX_FRAME_BYTES)
}

/** Parse a server → client text frame (room or lobby). No size cap (snapshots can be large). */
export function parseServerFrame(text: string): ParseResult<ServerFrame> {
  return parseWith(ServerFrameSchema, text, Number.POSITIVE_INFINITY)
}

/* ------------------------------------------------------------------ */
/* Compile-time agreement with the engine and the UI types             */
/* ------------------------------------------------------------------ */

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true[]> = T
/** Fails to compile if a schema drifts from the engine or UI type it mirrors. */
export type ProtocolContractCheck = Assert<
  [
    Same<SubmitResultCode, EngineSubmitResultCode>,
    Same<z.infer<typeof RuleSchema>, PrimeDaifugoSetupData>,
    Same<z.infer<typeof FactCardIdSchema>, FactCardId>,
    Same<z.infer<typeof CardIdSchema>, CardId>,
    Same<z.infer<typeof PidSchema>, Pid>,
  ]
>
