/**
 * Pid derivation (spec §3.1): `base64url(SHA-256("pd:" + sid)).slice(0, 16)` with Web Crypto.
 * The sid is never logged or stored; only the derived pid leaves this function.
 */
import { PID_HASH_PREFIX, PID_LENGTH, type Pid, base64url } from '../../src/shared/ids'

const encoder = new TextEncoder()

export async function derivePid(sid: string): Promise<Pid> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(PID_HASH_PREFIX + sid))
  return base64url(new Uint8Array(digest)).slice(0, PID_LENGTH)
}
