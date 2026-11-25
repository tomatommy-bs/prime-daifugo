/**
 * Player-name rule (spec §3.1, RQ-S2), shared by the middleware, the login page and the server.
 * A name is valid when, after trimming, it is 3 to 10 UTF-16 code units long.
 */

export const NAME_MIN_LENGTH = 3
export const NAME_MAX_LENGTH = 10

/** The canonical form of a name: surrounding whitespace removed. */
export function normalizeName(name: string): string {
  return name.trim()
}

export function isValidName(name: unknown): name is string {
  if (typeof name !== 'string') {
    return false
  }
  const { length } = normalizeName(name)
  return length >= NAME_MIN_LENGTH && length <= NAME_MAX_LENGTH
}
