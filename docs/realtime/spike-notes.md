# Foundation spike: `wrangler dev` offline

Date: 2026-11-25. Branch `feature/realtime-rebuild`. Spec §10 asks the foundation to check that
the local backend starts without a Cloudflare account and without network access.

## Setup

- `wrangler@4.160.0`, `@cloudflare/workers-types@5.20261110.1`, Node 22.16, macOS arm64.
- Worker: `worker/wrangler.jsonc` (`compatibility_date` 2026-11-01, SQLite-backed `RoomDO` and
  `LobbyDO` through the `v1` migration) with the foundation stub `worker/src/index.ts`:
  `GET /healthz` returns `ok` and every other route returns 501.
- No `wrangler login`, no `CLOUDFLARE_API_TOKEN`, no `worker/.dev.vars`.

## How "offline" was simulated

The machine's network could not be switched off from the agent sandbox. Instead, every outbound
HTTP(S) request from wrangler was routed to a dead proxy:

```sh
HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 \
WRANGLER_SEND_METRICS=false \
npx wrangler dev -c worker/wrangler.jsonc --port 8797 --local --persist-to <tmp>/wrangler-state
```

Port 8797 was used because 8787 was taken by unrelated local processes at the time. The command
is otherwise the same as `npm run dev:server`.

## Result

- **Boots offline: yes.** Wrangler printed only `Proxy environment variables detected` (expected
  with the dead proxy) and reached `Ready on http://localhost:8797`.
- **Startup time:** about 1.1 s from launch to the first successful `GET /healthz` (warm npm
  cache, second run of the day). Wrangler's update check and telemetry did not delay startup.
- `GET /healthz` → `200 ok`; `POST /rooms` → `501` (stub), as expected.
- Both Durable Object bindings show as `local`, and the `vars` from `wrangler.jsonc` are listed.
- `npx wrangler deploy --dry-run -c worker/wrangler.jsonc --outdir <tmp>` bundles both the
  default and `--env production` configs with no warnings (nothing is uploaded).

## Flags and notes for later tasks

- `WRANGLER_SEND_METRICS=false` (already in `dev:server`) disables telemetry; wrangler still
  prints the one-line telemetry notice. `WRANGLER_LOG=error` was not needed.
- Wrangler prints a "running in an AI agent" banner listing the local explorer API routes. It is
  harmless; it does not appear for humans.
- Durable Object state persists under `--persist-to .wrangler/state` (gitignored). Delete that
  folder to start from empty rooms.
- `worker/.dev.vars` (gitignored) or `--var KEY:VALUE` override the grace and TTL vars for manual
  or E2E runs.
- Named environments do not inherit bindings or vars, so `env.production` repeats the Durable
  Object bindings and vars. Its `ALLOWED_ORIGINS` are placeholders until the production domain is
  known (spec §11).
