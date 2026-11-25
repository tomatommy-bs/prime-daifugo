/**
 * Factor expressions (spec §7.3, RQ-R13, RQ-R16).
 *
 * Syntax (RQ-R16, decided in spec §14 item 7):
 * - tokens are card ids and the operators `*` and `^`; adjacent cards join into one decimal number;
 * - there is at least one operator, none at either end and never two in a row;
 * - no operand equals 1 (so `^1` is banned);
 * - `^` is allowed one level only (`a^b^c` towers are malformed); the base must be prime (checked by
 *   `checkFact`) and the exponent is any integer ≥ 2;
 * - at most `MAX_FACT_TOKENS` (64) tokens.
 *
 * This module is the single source of truth for factor validation: the server (engine) and the
 * client pre-validation (`src/utils/play-card.ts`) both use it.
 */
import { ONE, TWO, ZERO } from './bigint'
import { type CardId, isCardId } from './cards'
import { bitLength, concatValue, isPrime } from './numbers'
import type { SubmitResultCode } from './types'

/** A factor token: a card id or an operator (`FactCardId` in `src/interface/common.ts`). */
export type FactToken = CardId | '*' | '^'

/** Longest accepted factor expression, in tokens. */
export const MAX_FACT_TOKENS = 64

/** One multiplicative term `base^exp` (`exp = 1n` when the term has no `^`). */
export type FactTerm = { base: bigint; exp: bigint }

export type ParseFactResult = { ok: true; terms: FactTerm[] } | { ok: false }

const isOperator = (token: unknown): token is '*' | '^' => token === '*' || token === '^'

/** Parse a factor expression (RQ-R16). Any syntax error yields `{ ok: false }`. */
export function parseFact(tokens: readonly unknown[]): ParseFactResult {
  if (tokens.length === 0 || tokens.length > MAX_FACT_TOKENS) {
    return { ok: false }
  }
  const operands: bigint[] = []
  const operators: ('*' | '^')[] = []
  let digits: CardId[] = []
  for (const token of tokens) {
    if (isOperator(token)) {
      if (digits.length === 0) {
        // operator at the start or two operators in a row
        return { ok: false }
      }
      operands.push(concatValue(digits))
      operators.push(token)
      digits = []
    } else if (isCardId(token)) {
      digits.push(token)
    } else {
      return { ok: false }
    }
  }
  if (digits.length === 0 || operators.length === 0) {
    // operator at the end, or no operator at all
    return { ok: false }
  }
  operands.push(concatValue(digits))
  if (operands.some((operand) => operand === ONE)) {
    return { ok: false }
  }

  const terms: FactTerm[] = []
  let i = 0
  while (i < operands.length) {
    if (operators[i] === '^') {
      if (operators[i + 1] === '^') {
        // tower: one `^` level only
        return { ok: false }
      }
      terms.push({ base: operands[i], exp: operands[i + 1] })
      i += 2
    } else {
      terms.push({ base: operands[i], exp: ONE })
      i += 1
    }
  }
  return { ok: true, terms }
}

/** True when `tokens` is a well-formed factor expression (RQ-R16). */
export function isWellFormedFact(tokens: readonly unknown[]): boolean {
  return parseFact(tokens).ok
}

/** True when every term's base is prime (exponents may be any integer ≥ 2). */
export function allBasesPrime(terms: readonly FactTerm[]): boolean {
  return terms.every((term) => isPrime(term.base))
}

/**
 * Guarded evaluation: true when the product of `terms` equals `target`. Never computes a value
 * larger than `target`: an exponent above `bitLength(target) + 1` or a running product above
 * `target` short-circuits to false.
 */
export function factEquals(terms: readonly FactTerm[], target: bigint): boolean {
  if (target < TWO) {
    return false
  }
  const expCap = BigInt(bitLength(target) + 1)
  let product = ONE
  for (const { base, exp } of terms) {
    if (exp > expCap) {
      return false
    }
    for (let k = ZERO; k < exp; k += ONE) {
      product *= base
      if (product > target) {
        return false
      }
    }
  }
  return product === target
}

/** The cards used by a factor expression (operators dropped), in order. */
export function factCards(tokens: readonly unknown[]): CardId[] {
  return tokens.filter(isCardId)
}

/**
 * Judge a well-formed factor expression against the submitted number (RQ-R13):
 * - `INCORRECT_ANSWER` when the expression does not equal `target` (takes precedence);
 * - `FACT_CONTAIN_NOT_PRIME` when some base is not prime;
 * - `null` when the factorization is correct.
 */
export function checkFact(
  terms: readonly FactTerm[],
  target: bigint,
): Extract<SubmitResultCode, 'FACT_CONTAIN_NOT_PRIME' | 'INCORRECT_ANSWER'> | null {
  if (!factEquals(terms, target)) {
    return 'INCORRECT_ANSWER'
  }
  if (!allBasesPrime(terms)) {
    return 'FACT_CONTAIN_NOT_PRIME'
  }
  return null
}
