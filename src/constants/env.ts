const TRAILING_SLASHES = /\/+$/
const HTTP_SCHEME = /^http(s?):\/\//

/** Local `wrangler dev` (spec §10). Used only outside production builds. */
export const DEV_REALTIME_URL = 'http://127.0.0.1:8787'

/**
 * The realtime backend's base URL (http/https, no trailing slash), from `raw`
 * (`NEXT_PUBLIC_REALTIME_URL`). Unset or blank falls back to the local Worker outside production
 * and to `null` in production, where callers surface connection state `error`.
 */
export function resolveRealtimeUrl(raw: string | undefined, nodeEnv: string | undefined) {
  const value = raw?.trim()
  if (value) {
    return value.replace(TRAILING_SLASHES, '')
  }
  return nodeEnv === 'production' ? null : DEV_REALTIME_URL
}

// `process.env.NEXT_PUBLIC_*` must be read literally so Next inlines it into the client bundle.
export const REALTIME_URL: string | null = resolveRealtimeUrl(
  process.env.NEXT_PUBLIC_REALTIME_URL,
  process.env.NODE_ENV,
)

const joinPath = (base: string, path: string) => `${base}${path.startsWith('/') ? '' : '/'}${path}`

/** `httpUrl('/rooms')` → `http://127.0.0.1:8787/rooms`; `null` when no backend is configured. */
export function httpUrl(path: string, base: string | null = REALTIME_URL): string | null {
  return base === null ? null : joinPath(base, path)
}

/** `wsUrl('/lobby')` → `ws://127.0.0.1:8787/lobby` (`https` → `wss`); `null` when unconfigured. */
export function wsUrl(path: string, base: string | null = REALTIME_URL): string | null {
  return base === null ? null : joinPath(base.replace(HTTP_SCHEME, 'ws$1://'), path)
}
