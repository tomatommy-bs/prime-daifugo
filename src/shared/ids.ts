/**
 * Identifiers shared by the Next app, the Worker and the pure layers (spec §3.1, §6, §8.1).
 *
 * Frozen contract (foundation): parallel tasks import from here and never edit it.
 * Runtime code here must stay portable: no Node, DOM or Workers APIs except
 * `crypto.getRandomValues`, which every target runtime provides.
 */
import type { CardId as GameCardId } from '@/game-card/src/tools/suit-num'

/** Protocol version (spec §6). The server accepts `PV` and `PV - 1`. */
export const PV = 1

/** Room ids accepted by the router and the room page (RQ-L4). */
export const ROOM_ID_RE = /^[A-Za-z0-9_-]{1,32}$/

/** Client-held session secret: 32 random bytes in base64url (43 chars, no padding). */
export const SID_RE = /^[A-Za-z0-9_-]{43}$/

/** Cookie (and localStorage key) holding the sid. Not httpOnly: the Worker is cross-origin. */
export const SID_COOKIE = 'pd_sid'

/** Lifetime of the `pd_sid` cookie, in days. */
export const SID_COOKIE_DAYS = 365

/** Public player id: `base64url(SHA-256("pd:" + sid)).slice(0, 16)`, computed by the server. */
export type Pid = string

/** Prefix hashed together with the sid to derive the pid. */
export const PID_HASH_PREFIX = 'pd:'

/** Length of a pid in characters. */
export const PID_LENGTH = 16

/** The 52 card ids (RQ-R1), in the same order as `src/game-card` (S, H, C, D; A..K). */
export const CARD_IDS = [
  'AS',
  '2S',
  '3S',
  '4S',
  '5S',
  '6S',
  '7S',
  '8S',
  '9S',
  '10S',
  'JS',
  'QS',
  'KS',
  'AH',
  '2H',
  '3H',
  '4H',
  '5H',
  '6H',
  '7H',
  '8H',
  '9H',
  '10H',
  'JH',
  'QH',
  'KH',
  'AC',
  '2C',
  '3C',
  '4C',
  '5C',
  '6C',
  '7C',
  '8C',
  '9C',
  '10C',
  'JC',
  'QC',
  'KC',
  'AD',
  '2D',
  '3D',
  '4D',
  '5D',
  '6D',
  '7D',
  '8D',
  '9D',
  '10D',
  'JD',
  'QD',
  'KD',
] as const

/** A card id such as `10H` (identical to the UI's `CardId` from `src/game-card`). */
export type CardId = (typeof CARD_IDS)[number]

/** Factor-expression operator tokens (`FactCardId = CardId | '*' | '^'`, `src/interface/common.ts`). */
export const FACT_OPERATORS = ['*', '^'] as const

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T
/** Fails to compile if the shared card list and the UI's `CardId` ever differ. */
export type CardIdContractCheck = Assert<Same<CardId, GameCardId>>

/** WebSocket close codes (spec §6.2). */
export const CLOSE = {
  left: 4000,
  superseded: 4001,
  'room-full': 4002,
  'bad-name': 4003,
  protocol: 4004,
  'upgrade-required': 4005,
  'room-gone': 4006,
} as const

export type CloseCode = (typeof CLOSE)[keyof typeof CLOSE]

/** Close codes after which the client must not auto-reconnect. */
export const TERMINAL_CLOSE_CODES: readonly number[] = Object.values(CLOSE)

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** base64url without padding. */
export function base64url(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63] + B64URL[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63]
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63]
  }
  return out
}

/** `n` cryptographically random bytes, base64url-encoded. */
export function randomId(n = 16): string {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

/** A fresh sid (32 random bytes → 43 base64url chars). */
export function generateSid(): string {
  return randomId(32)
}

/** A fresh room epoch (spec §4.1): changes whenever a room's state is created anew. */
export function generateEpoch(): string {
  return randomId(12)
}

export function isValidSid(value: unknown): value is string {
  return typeof value === 'string' && SID_RE.test(value)
}

export function isValidRoomId(value: unknown): value is string {
  return typeof value === 'string' && ROOM_ID_RE.test(value)
}
