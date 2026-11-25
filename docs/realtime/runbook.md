# Realtime backend runbook

Operations guide for the Cloudflare Worker `prime-daifugo-rt` (two SQLite-backed Durable Objects,
`RoomDO` and `LobbyDO`) and the Vercel frontend. Design background: [`rebuild-spec.md`](./rebuild-spec.md)
§10 (local development) and §11 (deployment).

> Nothing in this repository deploys automatically from CI. CI only bundles the Worker with
> `wrangler deploy --dry-run`. Every deploy below is a deliberate human action.

---

## 1. Environments

| | Dev (local) | Preview | Production |
|---|---|---|---|
| Frontend | `next dev` on `:3000` (`npm run dev` / `npm run dev:web`) | Vercel Preview deployments (`<project>-*.vercel.app`) | Vercel Production (`https://<prod-domain>`) |
| Backend | `wrangler dev --local` on `:8787` (`npm run dev:server`), state in `.wrangler/state` | The production Worker (there is no separate preview Worker) | Worker `prime-daifugo-rt`, `--env production` |
| `NEXT_PUBLIC_REALTIME_URL` | `http://127.0.0.1:8787` (committed `.env.development`) | `https://rt.<domain>` (Vercel env, Preview scope) | `https://rt.<domain>` (Vercel env, Production scope) |
| `ALLOWED_ORIGINS` | `worker/wrangler.jsonc` `vars`: `http://localhost:3000,http://127.0.0.1:3000,http://localhost:3123,http://localhost:3124` | covered by the production list (`https://<project>-*.vercel.app`) | `worker/wrangler.jsonc` `env.production.vars`: `https://<prod-domain>,https://<project>-*.vercel.app` |
| `GRACE_PLAYING_MS` / `GRACE_IDLE_MS` | 120000 / 60000 (override in `worker/.dev.vars` or `--var KEY:VALUE`) | defaults | defaults |
| `AWAY_TURN_CAP_MS` | 20000 | defaults | defaults |
| `ROOM_TTL_IDLE_MS` / `ROOM_TTL_ACTIVE_MS` | 600000 / 1800000 | defaults | defaults |
| `ROOMS_SECRET` (Worker secret + Vercel server env) | unset: `POST /rooms` stays open | the production value (Vercel env, Preview scope) | Worker secret and Vercel env (Production scope), same value |
| E2E | `E2E=1 npm run test:e2e` starts its own Worker with 5 s grace and a 3 s away cap, plus `next dev -p 3124` | — | — |

Notes:
- `next.config.mjs` fails a build with `VERCEL_ENV=production` when `NEXT_PUBLIC_REALTIME_URL` is
  missing or points at `localhost`/`127.0.0.1`. Preview builds are not guarded, so check the Preview
  value by hand.
- The default (dev) env in `worker/wrangler.jsonc` is named `prime-daifugo-rt-dev`, so a
  `wrangler deploy` without `--env production` creates that separate Worker and never overwrites
  production with the dev `ALLOWED_ORIGINS`. Delete it from the dashboard if it gets created.
- Named wrangler environments do not inherit `vars` or bindings. `env.production` repeats the
  Durable Object bindings and every var; change both blocks together.
- The Worker has one optional secret, `ROOMS_SECRET`. When set, `POST /rooms` must carry it in
  `x-rooms-secret` (403 otherwise). The Next server sends it from its own `ROOMS_SECRET` env var
  (server-only; never a `NEXT_PUBLIC_*` name) along with the visitor's IP (`x-client-ip`), which
  the lobby then rate-limits (20 rooms per minute per visitor, and at most 500 unclaimed
  reservations overall; 429 / 503 beyond that). Without the secret the limit is keyed on the
  connecting IP, which for `/room/new` is Vercel's egress IP. Never commit the value;
  `worker/.dev.vars` is gitignored.

---

## 2. Deploy

**Order: Worker first, then Vercel.** The Worker accepts protocol `PV` and `PV-1`, so a new Worker
works with the old frontend. The reverse is not guaranteed (an older Worker answers a newer client
with `bye{upgrade-required}`).

### 2.1 Before the first deploy (one time)

1. Replace the placeholder `ALLOWED_ORIGINS` in `worker/wrangler.jsonc` `env.production.vars` with the
   real production domain and the Vercel preview pattern.
2. Check the migration block: tag `v1` declares `new_sqlite_classes: ["RoomDO", "LobbyDO"]`. The Free
   plan requires SQLite-backed classes. Never edit a migration that has been deployed; add a new tag.
3. Set up the custom domain (§3) and the usage notification (§4).
4. Generate a random value (for example `openssl rand -base64 32`) and set it on both sides:
   `npx wrangler secret put ROOMS_SECRET -c worker/wrangler.jsonc --env production`, and the Vercel
   env var `ROOMS_SECRET` for **Production** and **Preview**. Set the Vercel one first (the Worker
   ignores the header while it has no secret), then the Worker secret.

### 2.2 Worker

Recommended: **Workers Builds** (Cloudflare's Git integration).

1. Cloudflare dashboard → Workers & Pages → Create → Import a repository → this repository.
2. Production branch: `main`. Build command: none. Deploy command:
   `npx wrangler deploy -c worker/wrangler.jsonc --env production`.
3. Root directory: the repository root (the config path is relative to it).
4. Every push to `main` then deploys the Worker. Disable non-production branch builds, since
   there is no preview Worker.

Manual alternative (from a clean checkout of the commit to ship):

```bash
npm ci
npx wrangler login              # once per machine
npm run deploy:server           # wrangler deploy -c worker/wrangler.jsonc --env production
```

Check it: `curl https://rt.<domain>/healthz` returns `ok`.

What a Worker deploy does to live games: every Durable Object restarts and every socket drops.
Clients reconnect within about a second. On wake, the room reconciles (RQ-S19): any member with no
live socket gets a fresh grace period and a running deadline becomes `max(stored, now + 10 s)`, so
nobody loses a turn or a seat. The welcome replay or snapshot restores the boards.

### 2.3 Vercel

1. Project → Settings → Environment Variables: set `NEXT_PUBLIC_REALTIME_URL=https://rt.<domain>`
   for **Production** and **Preview**. It is inlined at build time, so redeploy after changing it.
2. Remove the old `NEXT_PUBLIC_PARTYKIT_HOST` variable once the rebuild is live.
3. Deploy through the existing Git integration (push or merge to `main`), after the Worker deploy
   has finished.

---

## 3. Custom domain

`workers.dev` is blocked on some corporate and school networks, so use a custom domain.

1. The domain's zone must be on Cloudflare.
2. Worker → Settings → Domains & Routes → Add → Custom domain → `rt.<domain>`. Cloudflare creates
   the DNS record and certificate.
3. Optionally set `"workers_dev": false` in `env.production` once the custom domain works.
4. Point `NEXT_PUBLIC_REALTIME_URL` at `https://rt.<domain>` (§2.3).

---

## 4. Usage notifications and limits

Free-tier limits fail hard: once exceeded, requests error until 00:00 UTC.

1. Cloudflare dashboard → Notifications → Add → **Usage Based Billing** / Workers usage alert
   (whichever the account offers) for Durable Objects requests and duration, and Workers requests.
   Alert at around 70 % of the daily free allowance.
2. The tightest limit is Durable Object duration (GB-s). Hibernated sockets are not billed, so a
   stray `setTimeout`/`setInterval` in `worker/src/**` (which blocks hibernation) is the usual cause
   of a spike. Biome rejects them; keep that rule.
3. Rows written: a move costs about 3-4 rows, so 100 k rows a day is roughly 25 k moves.
4. **Escape hatch:** switch the account to **Workers Paid ($5/month)**. No code change is needed.

---

## 5. Rollback

1. **Worker:** `npx wrangler rollback --env production` (or Dashboard → Worker → Deployments →
   Rollback) to the previous version. Room state is forward-compatible: `schema` is checked on load,
   and an unknown schema starts a fresh room instead of crashing.
2. **Vercel:** Dashboard → Deployments → the previous production deployment → Promote / Instant
   Rollback.
3. Roll back in the reverse order of deploy when the protocol changed: Vercel first, then the
   Worker. If only one side changed, roll back just that side.
4. Never roll back across a Durable Object migration tag change without checking the migration;
   a rollback cannot un-apply a migration.

---

## 6. Smoke checklist (after every production deploy)

Use two devices (or a laptop and a phone) on different networks if possible.

- [ ] `curl https://rt.<domain>/healthz` returns `ok`.
- [ ] Home page: the オンライン / ロビー / 部屋 counters change from "—" to numbers.
- [ ] **Create a room:** 部屋を作る (`/room/new`) redirects to `/room/<prime>`. The loading and error
      screens look as before.
- [ ] **Two devices:** the second device joins by URL or QR code. Both press 準備OK, one presses
      ゲーム開始, and a draw, a pass and a submit work on both screens.
- [ ] **Reload mid-game:** reload one device. It comes back to the same seat, hand and turn, and the
      other device shows no 退出 notice.
- [ ] **Airplane mode 10 s:** turn on airplane mode on the phone for 10 s, then off. The board shows
      接続中… and then resumes with the same hand. The other device sees the seat marked
      （再接続中） only while offline.
- [ ] Home page counters show the room with two players.
- [ ] Explicit 退出 from the header returns to `/`, and the other device sees the player leave.

---

## 7. Manual phone checklist (before release; local dev on the LAN is enough)

`npm run dev` cannot be used for this: `wrangler dev` listens on loopback only unless given
`--ip 0.0.0.0`, and `concurrently` passes no extra flags to `npm:dev:server`. Run the two servers
in separate terminals instead (replace `192.168.1.10` with the laptop's LAN address, e.g.
`ipconfig getifaddr en0`):

```bash
# terminal 1: the Worker on every interface; --var replaces the whole list, so keep localhost
npm run dev:server -- --ip 0.0.0.0 --var ALLOWED_ORIGINS:http://localhost:3000,http://192.168.1.10:3000
# terminal 2: Next.js pointed at the LAN Worker (add `-- -H 0.0.0.0` if it is not reachable)
NEXT_PUBLIC_REALTIME_URL=http://192.168.1.10:8787 npm run dev:web
```

Instead of `--var`, the origin list can go in `worker/.dev.vars` (gitignored) as
`ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.10:3000`. Open
`http://192.168.1.10:3000` on the phones (same Wi-Fi). Check from a phone that
`http://192.168.1.10:8787/healthz` answers `ok` first; if not, allow incoming connections for
`workerd` in the macOS firewall.

- [ ] **iOS Safari, background 2 min:** in a game, switch to another app for 2 minutes and come back.
      The tab reconnects at once (visibility trigger). If it was away less than the 120 s grace, the
      seat and hand are kept; turns that came up meanwhile were auto-passed after 20 s.
- [ ] **iOS Safari, background past grace:** stay away for more than 2 minutes. On return the player
      has forfeited (their cards went back to the deck) and watches as an observer; they can ready up
      for the next round from the GAME SET dialog.
- [ ] **Android Chrome, tab discard:** open several heavy tabs (or `chrome://discards` → Discard)
      until the game tab is discarded, then return. The page reloads and rejoins the same seat with
      the same hand (the `pd_sid` cookie and its localStorage mirror keep the identity).
- [ ] **Airplane mode 10 s** on each phone, as in §6.
- [ ] **Duplicate tab:** open the room URL in a second tab on the same phone. The first tab shows
      別のタブで開かれています, and このタブで再開 takes the seat back.

## 7.1 Offline start check (RQ-O5, once per release)

`npm run dev` must start and play with no network and no Cloudflare account.

- [ ] In a fresh clone, run `npm ci` while online (dependencies cannot come from nowhere).
- [ ] Turn Wi-Fi off (and unplug Ethernet), then run `npm run dev`. Both `web` and `rt` start
      without errors or hangs; `curl http://127.0.0.1:8787/healthz` answers `ok`.
- [ ] Open `http://localhost:3000` in two browser profiles with different names, create a room,
      join it from the other profile and play a few moves (draw, pass, submit).
- [ ] Turn the network back on.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Every WebSocket gets 403 | Origin not in `ALLOWED_ORIGINS` | Add the origin to `env.production.vars` and redeploy the Worker |
| `/room/new` shows the error screen; Worker logs 403 on `POST /rooms` | `ROOMS_SECRET` differs between the Worker and Vercel, or is missing on Vercel | Set the same value on both sides (§2.1) and redeploy Vercel |
| `/room/new` errors with 429 / 503 | Room creation rate limit or the 500 pending-reservation cap | Expected under abuse; reservations lapse after 10 min |
| Production build fails with a realtime URL error | `NEXT_PUBLIC_REALTIME_URL` missing or local in Vercel Production | Set it (§2.3) and redeploy |
| Clients reload once after a deploy | Protocol skew (`bye{upgrade-required}`) | Expected once; make sure the Worker was deployed first |
| Errors until 00:00 UTC | Free-tier limit reached | Check usage (§4); move to Workers Paid if it recurs |
| Counters stuck at "—" | Lobby socket cannot connect | Check `/healthz`, the custom domain and `ALLOWED_ORIGINS` |
| A room is gone after a long break | GC after 10 min (`waiting`) or 30 min (in game) with nobody connected | Expected (RQ-S15); create a new room |
