/**
 * BigInt constants and helpers.
 *
 * The root `tsconfig.json` sets no ES2020+ `target`, so BigInt literals (`1n`) and `**` on bigint
 * do not type-check there. The rules engine therefore builds its constants with `BigInt()` once
 * and multiplies explicitly. (If integration raises the target to ES2020, literals become usable.)
 */
export const ZERO = BigInt(0)
export const ONE = BigInt(1)
export const TWO = BigInt(2)
export const THREE = BigInt(3)
export const FOUR = BigInt(4)
export const FIVE = BigInt(5)
export const SEVEN = BigInt(7)

/** `base^exp` for a non-negative integer `exp` (square-and-multiply). */
export function bigPow(base: bigint, exp: number | bigint): bigint {
  let result = ONE
  let b = base
  let e = BigInt(exp)
  while (e > ZERO) {
    if ((e & ONE) === ONE) {
      result *= b
    }
    b *= b
    e >>= ONE
  }
  return result
}
