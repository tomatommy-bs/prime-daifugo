# Prime Daifugo realtime rebuild spec

Status: **final for implementation** (tech-lead decision, 2026-11-25)
Branch: `feature/realtime-rebuild`
Machine-readable plan: [`implementation-plan.json`](./implementation-plan.json)

Owner directive: carry over **only the requirements** from the existing PartyKit implementation. The implementation approach is open. The main goal is **stable session management**: reloads, network blips and phone tab sleep must not lose a seat or a hand, reconnecting resumes the game, leaving is graceful, there are no ghost players, timers are robust and the server enforces the rules. The redesigned UI (`src/design`, `src/app/room/[id]/_ui/board/*`, `src/game-card`) stays. Its data layer is rewritten.

Source documents: the four requirement reports (rules, session, client, ops), three architecture proposals (A: Cloudflare Durable Objects, B: Node `ws` on Fly.io, C: Convex) and three judge reviews. All three judges chose A. This spec is A plus the grafts the judges agreed on.

Reference tags used below: `rules §n`, `session XX-n`, `client Rn`, `ops R-xx` refer to the requirement reports. `README:n` refers to `README.md` lines. File references are to the current tree.

---

## Contents

1. Consolidated requirements
2. Architecture and rationale
3. Identity and session model
4. State model and persistence
5. Timers
6. Protocol
7. Rules engine
8. Lobby and room creation
9. Client data layer
10. Local development
11. Deployment (documented only)
12. Test strategy
13. PartyKit removal
14. Decisions taken for the owner
15. Implementation plan

---

## 1. Consolidated requirements

Each requirement must be testable. The **Test** column names the test layer that proves it: `E` = engine unit (§12 L1), `S` = session reducer and simulator (L2), `H` = worker host unit (L2h), `I` = worker integration in workerd (L3), `C` = client unit, `P` = Playwright E2E (L4), `B` = build or CI check.

### 1.1 Rules (RQ-R)

| ID | Requirement | Source | Test |
|---|---|---|---|
| RQ-R1 | The deck is 52 cards with no joker. Card ids are `<num><suit>`: num ∈ A,2..10,J,Q,K and suit ∈ S,H,C,D. | rules §1, `suit-num.ts:81-134` | E |
| RQ-R2 | Card values: A=1, J=11, Q=12, K=13, every other card its face value. | rules §1, `play-card.ts:13-26` | E |
| RQ-R3 | Several cards form one number by writing their decimal values side by side in play order. For example `[Q,A]` is 121 and `[10,3]` is 103. The arithmetic uses **BigInt**, so 52-card numbers are exact. | rules §1, §8.13 | E |
| RQ-R4 | The client sorts hands by value, then by suit S<H<C<D. | `play-card.ts:173-186` | C |
| RQ-R5 | With `halfEvenNumbers` on, the 12 cards 2,4,6,8,10,Q of ♥ and ♦ are removed, leaving 40 cards. | rules §1, `game-rule.test.ts:85-121` | E |
| RQ-R6 | A game has 2 to 4 **playing** seats. Only seats are in the turn order. Observers never get a turn. | rules §2, §8.1; session OB-3 | E,S |
| RQ-R7 | Each seat is dealt `rule.initNumCards` cards and starts with `drawRight=true`. The field starts empty and the remaining cards form the deck. The deck-size check uses `initNumCards × seats`. | rules §2, §8.2 | E |
| RQ-R8 | Only `currentPlayer` may draw, pass or submit. Any other sender gets a rejection. Nothing is broadcast and the timer is not reset. | rules §3, §8.8 | E,S |
| RQ-R9 | A player may draw at most once per turn, and only from a non-empty deck. Drawing does not end the turn. A pass or a judged submit resets `drawRight` to true. | rules §3.1 | E |
| RQ-R10 | A player may pass at any time on their turn, including on an empty field. The turn moves to the next seat. | rules §3.2 | E |
| RQ-R11 | **Flow (流れ):** after any action that ends a turn, if the new current player is `deckTopPlayer`, the field is shuffled into the deck, `deckTopPlayer` becomes null and that player leads on an empty field. A failed submit counts toward the rotation. | rules §3.2, README rule 6 | E |
| RQ-R12 | Submit validation runs in this order: the submit is non-empty; it has at most `maxSubmitNumCards` cards; **the submit and factor card tokens are distinct and all in the hand (multiset check)**; on a non-empty field the card count equals the top set's count and the value is strictly greater; the factor expression is well formed. Any failure rejects the move with no penalty and **no state change**. | rules §3.3, §8.3-8.5 | E |
| RQ-R13 | Plain mode: the number is prime, or exactly 57; otherwise the result is `BASE_IS_NOT_PRIME`. Factor mode: all factors are prime, otherwise `FACT_CONTAIN_NOT_PRIME`; the expression equals the submitted number, otherwise `INCORRECT_ANSWER`. If both checks fail, `INCORRECT_ANSWER` wins. | rules §3.3 | E |
| RQ-R14 | On success, the submit cards go onto the field as one set, the factor cards go back into the deck (which is reshuffled), and `deckTopPlayer` becomes the submitter. | rules §3.3, README:32 | E |
| RQ-R15 | Penalties: `BASE_IS_NOT_PRIME` draws `submit.length` cards. A factor failure draws `submit.length` plus the number of card tokens in the factor expression. If the deck is short, the player draws what is left. All draws take from the **end** of the deck array. | rules §3.3, §8.14 | E |
| RQ-R16 | Factor syntax: cards and `*`/`^` alternate; adjacent cards join into one number; there is at least one operator, none at either end and never two in a row; no operand equals 1 (so `^1` is banned). `^` is allowed **one level only**: the base must be prime and the exponent can be any integer ≥ 2. Towers are rejected as malformed. | rules §3.4 (the [AMBIG] is decided, §14) | E |
| RQ-R17 | **57 cut:** after a *successful* submit whose number is 57 (in plain or factor mode), the same player keeps the turn, the field flows at once and they lead on an empty field. A failed 57 behaves like any other failure. | rules §4, §8.7 | E |
| RQ-R18 | The game ends when a seat's hand is empty. The winner is that seat. This includes winning on a 57 cut, and it works when the winner is disconnected. | rules §5, §8.6 | E,S |
| RQ-R19 | After the game ends, any further move is rejected (`bad-status`). | rules §8.9 | E,S |
| RQ-R20 | The engine is pure and deterministic given an injected RNG. Its state is plain JSON, and a game exported and re-imported continues identically. | rules §2 [PINNED] `game-party.test.ts:104-129` | E |
| RQ-R21 | Every [PINNED] test in `game-rule.test.ts`, `game-party.test.ts` and `play-card.test.ts` is ported, except where an intentional fix changes the expected result. Each such case is listed in the ported test file with a comment. | rules §9 | E |
| RQ-R22 | Rule options: `timeLimit` ∈ {15,60,300}, `initNumCards` ∈ {4,8,11}, `maxSubmitNumCards` ∈ {4,52}, `halfEvenNumbers` boolean. Defaults come from `GAME_CONFIG`. The server rejects any other value. | rules §6, `waiting-room.tsx:178-275` | E,S |

### 1.2 Session and room (RQ-S)

| ID | Requirement | Source | Test |
|---|---|---|---|
| RQ-S1 | Player identity is a stable `pid` derived on the server from a client-held secret `sid`. It survives reload, reconnect, tab discard and server redeploy. It never depends on a connection id. | session ID-4, ID-R1 | S,I,P |
| RQ-S2 | The server validates names as 3 to 10 characters after trimming, using the same function as the middleware. Duplicate names are allowed. A raw id is never shown as a name. | session ID-R2, ID-3 | S |
| RQ-S3 | One seat per `pid`. When a second tab opens, the newest connection wins. The old socket is closed with 4001, and the old tab does not auto-reconnect. | session ID-R3, failure 4 | S,H,P |
| RQ-S4 | A socket close (blip, sleep, reload or kill) marks the member `connected=false`. Their seat, hand and ready flag are kept for a grace period, and the room broadcasts no "left" message. | session LV-R, JN-2 | S,P |
| RQ-S5 | Reconnecting within grace restores the same seat, hand, ready flag, rule and deadline. Missed events are replayed, or a snapshot is sent if the gap is too large. | session §10.1-2, client R5 | S,I,P |
| RQ-S6 | When grace expires, or on an explicit `leave`, a seated player in a running game forfeits. Their hand returns to the deck and their seat leaves the turn order. If one seat remains, it wins. Outside a game, the member is removed. | session LV-R, open question 1 | S,P |
| RQ-S7 | An explicit leave (header 退出) takes effect immediately and the client does not reconnect. A reload is never treated as a leave. | client R1 "leave" | C,P |
| RQ-S8 | Presence lists each `pid` once, with `{id,name,ready,role,connected}`. Lobby and room counts are by connected member, not by socket. | session JN-2, LB-2; ops R-D4 | S,H |
| RQ-S9 | Room states are `waiting` → `playing` → `waitingNextRound` → `playing` … and are always persisted. A room is never reset because its last socket closed. | session WR-1, LV-2 | S,I |
| RQ-S10 | Ready and unready are allowed in `waiting` and `waitingNextRound`, from any member, observers included. | session WR-2, OB-2 | S |
| RQ-S11 | The rule is stored on the server. `set-rule` is accepted only in `waiting`/`waitingNextRound` and only with allowed values. Snapshots include the rule, so late joiners see it. `start` always uses the stored rule. | session WR-4, WR-5 | S |
| RQ-S12 | `start` is accepted only in `waiting`/`waitingNextRound`, with at least 2 members who are ready and connected, and with a matching `expectedVersion`. Concurrent starts deal once. The first 4 ready members by `readyAt` get seats and the rest observe. Setup is computed before `status` changes, so a setup failure leaves the room unchanged. | session WR-3, GP-4, GP-5 | S |
| RQ-S13 | A member who joins mid-game is an observer, gets no hand and can ready up for the next round. | session OB-1, OB-2 | S,P |
| RQ-S14 | A room holds at most 4 seats plus 8 observers (12 members). Any extra connection gets `bye{room-full}`. | session open question 4 | S |
| RQ-S15 | A room is garbage-collected after no member has been connected for 10 min (`waiting`) or 30 min (`playing`/`waitingNextRound`). Any connect cancels the GC. | ops R-C3, session LV-R | S,I |
| RQ-S16 | Each viewer gets their own redacted view: their own hand, other players' `handCount` and `deckCount`. No message ever contains another player's cards or the deck order. | session GP-2, client R2 | S,H |
| RQ-S17 | Moves are applied one at a time per room. Every accepted state change increments `version`, which is also the event `seq`. Each event is persisted before it is sent. | rules §8.12, client R4.4 | S,H |
| RQ-S18 | Every command gets an `ack` with either `ok:true` or `ok:false` and a reason. Rejected commands write nothing. | session GP-1, client R7 | S,H |
| RQ-S19 | After a server restart or deploy, any member marked connected but with no live socket gets a fresh grace period, and the running deadline becomes `max(stored, now+10s)`. A deploy never costs anyone a turn or a seat. | judges' graft | H,I |

### 1.3 Timer (RQ-T)

| ID | Requirement | Source | Test |
|---|---|---|---|
| RQ-T1 | The server owns an absolute `deadline` in epoch ms. It is set at game start and on every turn change: pass, judged submit, timeout, forfeit, flow and 57 cut. Empty-field leads are timed too. A draw does not reset it. | rules §7, session TM-R | E,S |
| RQ-T2 | When the deadline passes, the server passes for the current player through the same path as a manual pass, so flow applies. This works whether the player is connected, asleep or gone. | session TM-2 | S,I,P |
| RQ-T3 | While the current player is disconnected, their deadline is capped at `min(timeLimit, 20 s)`. | judges' graft | S |
| RQ-T4 | No deadline exists outside `playing`. Nothing ticks during GAME SET. | session TM-3 | S |
| RQ-T5 | The server sends no per-second ticks and makes no per-second writes. The client renders whole seconds from `deadline` and `serverNow`. 「残り5秒」 and the 10 s and 5 s colour states stay as they are. 「時間切れです」 is logged from the server's timeout event. | ops R-C2, client R6 | C |
| RQ-T6 | Moves carry `turn`. A move for a turn that has already ended is rejected as `stale`. A timer firing more than once (at-least-once alarms) has no extra effect. | judges' graft | S,H |

### 1.4 Client (RQ-C)

| ID | Requirement | Source | Test |
|---|---|---|---|
| RQ-C1 | The UI talks to the backend only through `useRoomSession(roomId)` (§9). Board components, `WaitingRoom`, the director, flights and the seat model keep working with only the documented `handCount`/`connected` edits. | client R0, R10 | C |
| RQ-C2 | `selfId` is the stable `pid`, so seat `layoutId`s stay stable from the waiting room to the board. | client R3.3 | C |
| RQ-C3 | Snapshots (welcome, seq gap) never go through `classifyTransition`: no flights and no penalty animation. Replayed and live events do animate. | client R4.4 | C |
| RQ-C4 | Event order on a winning submit is `submitted` and then `game-ended`, each with its own seq. The director's `holdEnd` still works. | client R4.1 | C |
| RQ-C5 | `ConnectionOverlay` keeps its states `connecting/open/closed/error/waiting-sync`. Reconnecting maps to `connecting`, and the board stays mounted with the last state. A superseded tab shows 「別のタブで開かれています」 and a 「このタブで再開」 button. | client R5 | C |
| RQ-C6 | A rejected submit goes through the existing tray-error path (shake plus red toast). | client R7 | C |
| RQ-C7 | The client auto-pass is removed. | client R6 | C |
| RQ-C8 | On `visibilitychange→visible`, `online` and `pageshow(persisted)`, the client reconnects immediately if the socket is not open or has gone quiet. | proposal A §4.5 | C |

### 1.5 Lobby and entry (RQ-L)

| ID | Requirement | Source | Test |
|---|---|---|---|
| RQ-L1 | The home page shows live counters オンライン, ロビー and 部屋, with "—" until the first data arrives. | session LB-1 | C |
| RQ-L2 | Counts survive restarts and do not drift. A room that dies without reporting is dropped after 12 minutes without a report. | session LB-3 | H |
| RQ-L3 | `/room/new` gets a fresh, collision-free **prime** room id from the backend over plain HTTP (a 10-minute reservation) and redirects to it. Its error and loading UI are unchanged. | session RC-1, RC-2; ops R-D3 | H,C |
| RQ-L4 | Any `/room/<id>` matching `^[A-Za-z0-9_-]{1,32}$` can be joined by URL or QR code. | session RC-3 | H |
| RQ-L5 | The `name` cookie gate (3 to 10 characters, 365 days, `/login?callback=`) is kept. The middleware also issues the `pd_sid` cookie. | session ID-1, ID-2; ops R-D5 | C |
| RQ-L6 | Random match and training stay as disabled placeholders. | session LB-4 | — |

### 1.6 Operations (RQ-O)

| ID | Requirement | Source | Test |
|---|---|---|---|
| RQ-O1 | The frontend stays on Vercel. The backend deploys without PartyKit. | ops R-D1 | — |
| RQ-O2 | There is one public backend URL, `NEXT_PUBLIC_REALTIME_URL`. A production build fails if it is unset or points at localhost. CI builds with the committed default and no secrets. | ops R-D2, R-CI1 | B |
| RQ-O3 | The stack costs $0 on free tiers at hobby traffic, with no always-on instance and no per-second writes. Idle rooms cost nothing. | ops R-C1..C3 | — |
| RQ-O4 | Game state survives process eviction and deploys, because it lives in durable storage. | ops R-C4 | I |
| RQ-O5 | `npm run dev` starts the whole stack offline with no account. `npm run dev:web` and `npm run dev:server` exist separately. | ops R-L1, R-L2 | manual, P |
| RQ-O6 | `npm test` stays fast and browser-free and does not touch the network. `npm run screens` and `npm run test:storybook` work with no backend. | ops R-T4, R-L4 | B |
| RQ-O7 | CI runs `biome ci`, `tsc` for the app and the worker, tests, a build, the Storybook build and a worker bundle dry run. E2E is a separate opt-in job. | ops R-CI2, R-CI3 | B |
| RQ-O8 | No secrets are committed. `.env.development` holds only non-secret local defaults. | ops R-D6 | B |

---

## 2. Architecture and rationale

### 2.1 Chosen architecture

```
Browser (Next.js 14 on Vercel)
  /                 ── WS  {RT}/lobby ─────────────▶ Worker router ─▶ LobbyDO("lobby")
  /room/new (RSC)   ── POST {RT}/rooms ────────────▶ Worker router ─▶ LobbyDO.allocate()
  /room/[id]        ── WS  {RT}/rooms/:id/ws ──────▶ Worker router ─▶ RoomDO(idFromName(id))
                                                                        │  RPC report(id, n, status)
                                                                        └──────────▶ LobbyDO
Cloudflare Worker "prime-daifugo-rt"
  RoomDO  : SQLite storage, WebSocket Hibernation API, one alarm
  LobbyDO : SQLite storage, WebSocket Hibernation API, one alarm
Shared pure TypeScript (imported by the Worker and by Next):
  src/shared  protocol + rule options + ids + rng + name rule
  src/game    rules engine (BigInt, deterministic)
  src/session room reducer + per-viewer view + simulator
```

- **One Cloudflare Worker with two SQLite-backed Durable Object classes**, using the raw WebSocket Hibernation API (`ctx.acceptWebSocket`, `webSocketMessage`, `webSocketClose`, `alarm`). Neither `partyserver` nor the `agents` SDK is used.
- **All logic is pure.** `roomReduce(state, input, deps) → {state, events, directives, wakeAt}` contains every session and timer decision. The DO is a thin host that loads state, runs the reducer, persists, sends and re-arms the alarm. The host itself is written against injected `HostStorage`, `HostSocket` and `Clock` interfaces, so it can be unit-tested in Node. Only `room-do.ts`, `lobby-do.ts` and `index.ts` touch Cloudflare APIs.
- **The frontend stays on Vercel.** The UI's only contact with the backend is `useRoomSession`, backed by a hand-written reconnecting WebSocket transport. `partysocket` is dropped.

### 2.2 Why this choice

| Need | How the DO design meets it |
|---|---|
| Moves applied one at a time (bug 12) | A DO handles one event at a time, and the reducer is synchronous after the pid is resolved. |
| Nothing shown that could be lost (R-C4) | The DO output gate holds outgoing messages until the storage write is durable. |
| Robust timers | One alarm at `min(deadline, graceUntil*, gcAt, sweepAt)` survives eviction and is idempotent because it compares timestamps. |
| Idle rooms cost $0 (R-C1, R-C3) | Hibernation means idle sockets cost nothing, and an empty room deletes itself at `gcAt`. |
| Single-target ops | One Worker deployed through Git integration. No machine, volume or Docker image to run. |
| Testability | Engine, reducer and host are pure, so a deterministic simulator covers disconnect, reconnect and timeouts. |

The judges' scores (session stability / simplicity / cost-ops / dev-test / longevity): A 9/7/8-9/7-8/8-9, B 7-8/7/4-5/9/7-8, C 7/6/6/5-6/5-6.

### 2.3 Rejected alternatives

- **B: a Node `ws` server on Fly.io with SQLite.** It has the best developer experience and the most detailed session handling. Its best ideas are grafted in: lastSeq replay, restart fairness, turn guards, a capped deadline for away players and SimClock. It was rejected because it breaks the $0 constraint (about $2.4 a month), runs on a single machine with a host-pinned volume (a single point of failure) and has a 5-20 s outage on every deploy. Its free fallback, Render plus Neon, has cold starts of up to a minute.
- **C: Convex.** Transactions and the scheduler are elegant. It was rejected because there are no connection hooks (presence needs heartbeats with about 40 s detection), reactive queries merge transitions (so the board director would need a fragile event-window rebuild), the 1M calls/month budget runs out at about 25 games a day, offline local development is unverified and lock-in is the highest of the three.
- **`partyserver`** (Cloudflare's PartyKit successor). It was rejected as a dependency: this design needs only two fixed routes and stable pids rather than connection ids, and it has had no release for 4 months. It is documented as a fallback if the hand-written routing becomes a burden.
- **The `agents` SDK.** It is built for AI agents and pulls in a heavy runtime.
- **Colyseus.** Rooms live in process memory, its delta patches do not fit the director's `{prev,next,msg}` model, and the 0.x line breaks often.

### 2.4 Known weaknesses we accept

- Free-tier caps fail hard at the limit (errors until 00:00 UTC). Mitigation: a Cloudflare usage notification, and the $5 Workers Paid plan as the way out.
- Half-open mobile sockets can take up to about 75 s to detect. The server deadline keeps the game moving meanwhile.
- A stray `setTimeout` or `setInterval` in DO code blocks hibernation. Mitigation: a Biome `noRestrictedGlobals` rule scoped to `worker/src/**`, plus a review checklist item.
- The `workers.dev` domain is blocked on some networks. A custom domain is recommended (§11).
- Workerd time cannot be faked, so L3 integration tests use real short waits. They are kept few and opt-in. The deterministic layers (L1, L2, L2h) carry the logic coverage.

---

## 3. Identity and session model

### 3.1 Tokens

- **`sid`**: 32 random bytes in base64url, stored in the cookie `pd_sid` (365 days, `SameSite=Lax`, `Secure` in production, **not** httpOnly, path `/`).
  - It must be readable by JavaScript, because the Worker is on another origin and the browser will not send the cookie there.
  - `src/middleware.ts` sets it on `/room/*` when it is missing. `src/lib/session-id.ts` (client) reads it, mirrors it into `localStorage['pd_sid']`, restores the cookie from localStorage if the cookie was cleared, and generates a new one as a last resort. Every storage access is wrapped in try/catch.
  - Both sides validate the format with `^[A-Za-z0-9_-]{43}$`.
- **`pid`**: `base64url(SHA-256("pd:" + sid)).slice(0, 16)`, computed on the server with Web Crypto.
  - Other clients only ever see the `pid`. The `sid` appears only in `hello` and is never logged or stored by the server; only the pid is stored.
- **`name`**: taken from the `name` cookie and sent in `hello`. Validated by `isValidName` in `src/shared/name.ts`: trim, then 3 to 10 UTF-16 code units, the same rule as the current middleware. The middleware switches to this shared function.
  - An invalid name gets `bye{bad-name}` (close code 4003). The client then navigates to `/login?callback=<path>`.
  - A later `hello` with a different valid name updates `member.name`.
- **Threat model.** A JS-readable bearer token means an XSS bug could take over a seat. That is accepted for a hobby game with no accounts.
  - Mitigations: the WebSocket upgrade checks `Origin` against `ALLOWED_ORIGINS`; each socket has a token bucket of 20 commands per 5 s; frames over 8 KB are dropped; the app renders no user HTML (there is no chat).

### 3.2 Members, seats and roles

```ts
type Member = {
  name: string
  joinedAt: number
  ready: boolean
  readyAt: number | null
  role: 'player' | 'observer'   // player = holds a seat in the current/last game
  connected: boolean
  connNo: number                 // increments per accepted hello; identifies the live socket
  lastSeen: number
  graceUntil: number | null      // set when connected=false
}
```

- **Socket ≠ member.** Presence is derived from members and never from sockets.
- `role` is set at `start`: seated members become `player` and everyone else `observer`. A member joining while `status==='playing'` is an `observer`. At the end of a round, roles are kept so the GAME SET dialog can show the result. The next `start` recomputes them.

### 3.3 Connect, reconnect and duplicate tabs (newest wins)

1. The client opens `{RT}/rooms/:id/ws`. The router checks the room id pattern and `Origin`, then forwards to `RoomDO`.
2. The first frame must be `hello` within 10 s. Otherwise the server closes with 4004.
3. The host computes `pid`, then feeds `connect{pid, name, connNo: next, lastSeq, epoch}` to the reducer.
4. Reducer:
   - If the member exists, `connected=true`, `graceUntil=null` and `connNo=next`. The previous socket of that pid is told `bye{superseded}` and closed with **4001**.
   - If the member is new and the room is full, the reply is `bye{room-full}` (4002). Otherwise the member is added (`observer` if a game is running, `ready=false`).
   - The reducer chooses the welcome mode:
     - `current`: `epoch` matches and `lastSeq === version`. Nothing is resent.
     - `replay`: `epoch` matches and `ringFloor ≤ lastSeq+1 ≤ version`. The host sends the missed ring events, rendered for this viewer.
     - `snapshot`: anything else.
   - A `presence` event is emitted if `connected` changed or the member is new.
5. The client treats 4001 as terminal: it does not auto-reconnect and the overlay shows the superseded copy. The 「このタブで再開」 button calls `reconnect()`, which takes the seat back (and supersedes the other tab).

### 3.4 Disconnect detection

- **Server side.** `webSocketClose`/`webSocketError` feeds `disconnect{pid, connNo}`. It is ignored unless `connNo === member.connNo`, so stale closes from superseded tabs do nothing.
- **Client liveness.** The client sends the text `ping` every 20 s. `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'))` answers without waking the DO. If no frame (including `pong`) arrives for 45 s, the client force-closes and reconnects.
- **Server sweep.** While any socket is attached, `sweepAt = now + 60 s`. On sweep, the host closes sockets whose `getWebSocketAutoResponseTimestamp()` is older than 75 s (falling back to the last-message time) and feeds `disconnect` for each.
- **Mobile resume.** On `visibilitychange→visible`, `online` and `pageshow(persisted)`, the client reconnects at once (skipping backoff) if the socket is not OPEN or nothing has arrived for 25 s.
- **Backoff.** 0.5, 1, 2, 4, 8, then a 10 s cap, with ±30 % jitter, retrying forever. There is no auto-reconnect after a terminal `bye` (superseded, left, room-full, bad-name, upgrade-required).

### 3.5 Grace period and abandonment

| Situation | On disconnect | Grace | After grace |
|---|---|---|---|
| `waiting` / `waitingNextRound` | `connected=false`, ready kept, presence shows ◌ | `GRACE_IDLE_MS` = 60 000 | member removed |
| `playing`, seated | `connected=false`, seat, hand and ready kept; their turns are capped at 20 s and the server auto-passes them | `GRACE_PLAYING_MS` = 120 000 | **forfeit** (§3.6), then member removed |
| `playing`, observer | `connected=false` | `GRACE_IDLE_MS` | removed |

All durations are config values (`RoomConfig`) that Worker `vars` can override. Tests and E2E use short values.

### 3.6 Forfeit and leave

Forfeit is an engine function, `forfeit(core, pid, rng)`:
1. The pid's hand goes into the deck, which is reshuffled.
2. The pid leaves `playOrder`.
3. If it was `deckTopPlayer`, the field **flows immediately** (into the deck, `deckTopPlayer=null`). This is the simplest consistent rule; see §14.
4. If it was `currentPlayer`, the turn moves to the next remaining seat, and that player leads on an empty field if step 3 flowed.
5. If only one seat remains, the game ends with `winner = that seat` and reason `last-standing`.

The session layer then sets the member's `role` to `observer` (or removes the member if this came from grace expiry or leave), sets a new deadline if the turn changed, and emits `forfeited{pid, reason}` followed by `game-ended` if the game finished.

**Explicit leave.** The header 「退出」 button opens a confirmation dialog and then sends the command `leave`. The server forfeits (if seated in a running game), removes the member, replies with ack and `bye{left}`, and closes with 4000. The client navigates to `/`.

`pagehide`/`beforeunload` **never** send `leave`, because a reload fires them too.

### 3.7 Observers and the next round

- In `waitingNextRound`, every member can toggle ready. `GameSetDialog` gains a ready toggle for members who are not ready, labelled 「次のラウンドに参加」 for observers.
- 「次のラウンドを開始」 sends `start{expectedVersion}`. Ready flags are **not** reset between rounds, matching current behaviour.

### 3.8 Ghost-free invariants

These are asserted after every simulator step:
- at most one member per pid, and at most one attached live socket per pid;
- `playOrder ⊆ {members with role 'player'}`, and every pid in `playOrder` is a member;
- every member is either connected, or has `graceUntil` set;
- `connected` members are exactly those whose current `connNo` socket is attached (the host checks this);
- lobby and room counts equal the number of connected members.

---

## 4. State model and persistence

### 4.1 Room state (persisted, pure JSON)

```ts
type RoomState = {
  schema: 1
  roomId: string
  epoch: string                 // random id created with the state; changes if the room is GC'd and recreated
  version: number               // = last event seq
  ringFloor: number             // lowest seq still in the event ring
  status: 'waiting' | 'playing' | 'waitingNextRound'
  rule: PrimeDaifugoSetupData
  members: Record<Pid, Member>
  game: null | {
    round: number
    core: GameCore              // engine state (§7): playOrder, currentPlayer, players, deck, field, deckTopPlayer, turn, winner, lastResult
    deadline: number | null     // epoch ms; null only when status !== 'playing'
    endReason: 'empty-hand' | 'last-standing' | null
  }
  gcAt: number | null
  lastReportedCount: number     // for lobby reporting
  lastReportAt: number
}
```

### 4.2 DO SQLite schema (RoomDO)

```sql
CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, json TEXT NOT NULL);  -- {e: RoomEvent, state: RoomState} post-state, unredacted
```

- **Ring buffer.** The ring keeps the last 64 events (`RING_SIZE`). Each insert also deletes rows with `seq < version-63` and updates `ringFloor`. A replay reads `seq > lastSeq` and renders each `state` for the viewer with `viewFor(state, pid)`.
- **Write path, per accepted input** (all synchronous `ctx.storage.sql.exec` in one implicit transaction):
  1. Upsert `room_state`.
  2. Insert events and delete old ones.
  3. `setAlarm(wakeAt)` if `wakeAt` changed (`deleteAlarm` if null).

  Outgoing messages are queued after these calls, so the output gate releases them only once the writes are durable.
- **Cost.** A typical move costs about 3-4 rows written. 100 k rows a day is roughly 25 k moves a day.
- **Wake path.** The constructor runs inside `ctx.blockConcurrencyWhile`. It creates the tables, loads `room_state` (or a fresh `waiting` state with a new epoch) and runs `reconcile{livePids, livePairs}` built from `ctx.getWebSockets()` and their attachments. This is RQ-S19: any member marked `connected` with no live socket is disconnected with a fresh grace, and if a game is running, `deadline = max(deadline, now + 10 s)`. Reconcile writes only if something changed.
- **Socket attachment.** `serializeAttachment({pid, connNo, name})`. Sockets are tagged with `pid` through `acceptWebSocket(ws, [pid])`, so `getWebSockets(pid)` finds them.
- **No event-sourcing recovery.** Recovery always loads the single state row. The ring exists only for client replay.
- **GC.** When `gcAt` passes: `deleteAll()`, `deleteAlarm()`, `LOBBY.release(roomId)`, and close any remaining sockets with 4006 (`room-gone`). The next connection to that id starts a new epoch.

### 4.3 Concurrency

- The only `await` before the reducer is the SHA-256 of `sid`. The host computes it, then re-reads the in-memory state and runs the reducer synchronously.
- No other `await` happens between load and persist. Lobby RPC reports are fire-and-forget **after** the persist (`ctx.waitUntil`).

### 4.4 LobbyDO schema

```sql
CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, count INTEGER NOT NULL, status TEXT, reserved_until INTEGER, updated_at INTEGER NOT NULL);
```

---

## 5. Timers

- **One alarm per DO.** `wakeAt = min(game.deadline, all member.graceUntil, gcAt, sweepAt)` is computed by the reducer, plus `sweepAt` from the host while sockets are attached.
- **Deadline policy (RQ-T1, T3).** On every turn change (detected by `core.turn` changing) and at start:
  `deadline = now + (currentPlayerConnected ? timeLimit : min(timeLimit, AWAY_TURN_CAP_MS)) * 1000`, with `AWAY_TURN_CAP_MS = 20000`.
  - When the current player disconnects mid-turn, the deadline becomes `min(deadline, now + 20 s)`.
  - When they reconnect, the deadline is **not** extended.
  - A draw keeps the deadline. Game end sets `deadline = null`.
- **`tick` input.** Processed in this order:
  1. If `status==='playing'` and `now >= deadline`, call `timeoutPass` and emit `passed{reason:'timeout', flowed}`. The new deadline follows the policy above.
  2. Every member with `graceUntil <= now` expires (§3.5/3.6).
  3. If `gcAt <= now`, GC.

  Every check compares timestamps, so a duplicated or early alarm is a no-op (RQ-T6). After a tick, the host also performs the sweep if `sweepAt <= now`.
- **Turn guard.** `draw`, `pass` and `submit` carry `turn`. If `turn !== core.turn`, the reply is `ack{ok:false, reason:'stale'}`.
- **Client clock.**
  - `offset = serverNow - Date.now()`, kept as an exponential moving average over messages.
  - A 1 Hz interval runs only while `deadline != null` and calls `clock.set(max(0, ceil((deadline - (Date.now() + offset)) / 1000)))`.
  - `TurnTimer`, `SeatClock` and 「残り5秒」 are unchanged.
  - 「時間切れです」 is logged when the event `passed{reason:'timeout'}` arrives.

---

## 6. Protocol

Defined in `src/shared/protocol.ts` as zod schemas with inferred types. It is JSON over WebSocket, plus the bare text frames `ping` and `pong`. Protocol version **`PV = 1`**.

### 6.1 Client → server

```ts
type Hello = { t: 'hello'; pv: number; sid: string; name: string; lastSeq: number | null; epoch: string | null }
type CmdFrame = { t: 'cmd'; id: string /* client request id, ≤ 32 chars */; c: Cmd }
type Cmd =
  | { type: 'ready' } | { type: 'unready' }
  | { type: 'set-rule'; rule: Partial<PrimeDaifugoSetupData> }
  | { type: 'start'; expectedVersion: number }
  | { type: 'draw'; turn: number }
  | { type: 'pass'; turn: number }
  | { type: 'submit'; turn: number; submit: CardId[]; factor: FactCardId[] }   // submit ≤ 52, factor ≤ 64
  | { type: 'leave' }
```

### 6.2 Server → client

```ts
type Welcome = { t: 'welcome'; pv: number; selfId: Pid; epoch: string; serverNow: number; mode: 'snapshot' | 'replay' | 'current'; seq: number; snap?: View }
// mode 'snapshot': snap present. 'replay': followed immediately by Evt frames seq lastSeq+1..seq. 'current': nothing follows.
type Evt = { t: 'evt'; seq: number; serverNow: number; e: RoomEvent; snap: View }   // snap = viewer's view of the post-state
type Ack = { t: 'ack'; id: string; ok: true; seq: number } | { t: 'ack'; id: string; ok: false; reason: RejectReason }
type Bye = { t: 'bye'; reason: 'superseded' | 'left' | 'room-full' | 'bad-name' | 'protocol' | 'upgrade-required' | 'room-gone' }

type RejectReason = 'not-your-turn' | 'stale' | 'bad-status' | 'invalid-move' | 'invalid-fact' | 'deck-empty'
  | 'already-drawn' | 'not-enough-ready' | 'bad-rule' | 'not-member' | 'rate-limited'

type RoomEvent =
  | { type: 'presence' }                                    // join, reconnect, disconnect, removal; view.members is the truth
  | { type: 'ready-changed'; by: Pid; ready: boolean }
  | { type: 'rule-changed'; by: Pid; rule: PrimeDaifugoSetupData }
  | { type: 'game-started'; by: Pid; round: number }
  | { type: 'drew'; by: Pid }
  | { type: 'passed'; by: Pid; reason: 'manual' | 'timeout'; flowed: boolean }
  | { type: 'submitted'; by: Pid; submit: CardId[]; factor: FactCardId[]; result: SubmitResultCode | null; cut57: boolean; flowed: boolean; penalty: number }
  | { type: 'forfeited'; pid: Pid; reason: 'grace' | 'leave' }
  | { type: 'game-ended'; winnerId: Pid; winnerName: string; reason: 'empty-hand' | 'last-standing' }
  | { type: 'member-left'; pid: Pid; name: string }

type SubmitResultCode = 'BASE_IS_NOT_PRIME' | 'INVALID_FACT' | 'FACT_CONTAIN_NOT_PRIME' | 'INCORRECT_ANSWER'  // INVALID_FACT kept for UI type compatibility; server never emits it (malformed → reject 'invalid-fact')
```

Close codes: 4000 left, 4001 superseded, 4002 room-full, 4003 bad-name, 4004 protocol, 4005 upgrade-required, 4006 room-gone.

### 6.3 View (per viewer, redacted)

```ts
type View = {
  roomId: string; status: RoomStatus; rule: PrimeDaifugoSetupData; version: number
  members: { id: Pid; name: string; ready: boolean; role: 'player' | 'observer'; connected: boolean }[]  // sorted by joinedAt
  game: null | {
    round: number; turn: number; playOrder: Pid[]; currentPlayer: Pid
    players: Record<Pid, { handCount: number; drawRight: boolean }>
    hand: CardId[]            // viewer's own hand; [] for observers
    field: CardId[][]; deckCount: number; deckTopPlayer: Pid | null
    deadline: number | null
    winner: { id: Pid; name: string } | null
    lastResult: SubmitResultCode | null
  }
}
```

### 6.4 Sequencing, resync and versioning

- Each accepted input emits 0..n events. Every event increments `version` and carries `seq = version` plus the full post-input view. A winning submit emits `submitted` and then `game-ended`, both carrying the same final view (RQ-C4).
- **Client rule.** If `epoch` matches and `seq === lastSeq + 1`, the event is applied and animated. If `seq <= lastSeq`, it is ignored (a duplicate). If there is a gap, the event's `snap` is applied as a snapshot without animation. It is always correct, because every frame carries the full view.
- **Version skew.** The server accepts `pv ∈ {PV, PV-1}`. Anything else gets `bye{upgrade-required}`, and the client runs `location.reload()` once, guarded by a sessionStorage flag. Deploy order is Worker first, then Vercel (§11).
- Frames over 8 KB, non-JSON frames or frames that fail schema validation get `bye{protocol}`. Before `hello`, a command frame also gets `bye{protocol}`.

---

## 7. Rules engine (`src/game`)

### 7.1 API (`src/game/types.ts` is the frozen contract)

```ts
interface Rng { next(): number }           // [0,1); prod: crypto-backed; tests: seeded mulberry32 (src/shared/rng.ts)
type Move = { type: 'draw' } | { type: 'pass' } | { type: 'submit'; submit: CardId[]; factor: FactCardId[] }
type GameCore = {
  rule: PrimeDaifugoSetupData; playOrder: Pid[]; currentPlayer: Pid; turn: number
  players: Record<Pid, { hand: CardId[]; drawRight: boolean }>
  deck: CardId[]; field: CardId[][]; deckTopPlayer: Pid | null
  lastResult: SubmitResultCode | null; winner: Pid | null
}
type MoveOutcome =
  | { kind: 'drew' }
  | { kind: 'passed'; flowed: boolean }
  | { kind: 'submitted'; result: SubmitResultCode | null; cut57: boolean; flowed: boolean; penalty: number; ended: boolean }
type EngineReject = 'not-your-turn' | 'bad-status' | 'invalid-move' | 'invalid-fact' | 'deck-empty' | 'already-drawn'
interface GameEngine {
  setup(seats: Pid[], rule: PrimeDaifugoSetupData, rng: Rng): { ok: true; core: GameCore } | { ok: false; reason: 'bad-player-count' | 'deck-too-small' }
  applyMove(core: GameCore, by: Pid, move: Move, rng: Rng): { ok: true; core: GameCore; outcome: MoveOutcome } | { ok: false; reason: EngineReject }
  timeoutPass(core: GameCore, rng: Rng): { core: GameCore; outcome: Extract<MoveOutcome, { kind: 'passed' }> }
  forfeit(core: GameCore, pid: Pid, rng: Rng): { core: GameCore; flowed: boolean; ended: boolean }
}
```

- **Immutability.** The input `core` is never mutated: the engine works on a `structuredClone`. A rejected move returns no new core, and tests assert the input is deep-equal to a snapshot taken before the call.
- `turn` increments on every turn change, including the 57 keep-turn, which counts as a new turn for the deadline.
- `setup` puts the seats in playOrder in the given order (the session decides the order) and sets `currentPlayer = playOrder[0]`. It drops the old `leftTime` field.
- `winner` is set when a hand becomes empty, before any flow resets `deckTopPlayer` (RQ-R18).

### 7.2 Numbers (`src/game/numbers.ts`)

- `cardValue`, and `concatValue(cards) → bigint`, which builds a decimal string and converts it with `BigInt`.
- `isPrime(n: bigint)`: trial division by primes below 1000, then deterministic Miller-Rabin with bases {2,3,5,7,11,13,17,19,23,29,31,37,41} for n < 3.317·10^24, then a strong Lucas test (Baillie-PSW) above that. BPSW has no known counterexample but is not a proof; this is documented in the file header.
- `GROTHENDIECK = 57n`.

### 7.3 Factor expressions (`src/game/factor.ts`)

- `parseFact(tokens) → {ok:true, terms: {base: bigint, exp: bigint}[]} | {ok:false}` applies the syntax rules of RQ-R16. More than 64 tokens is malformed.
- `checkFact(terms, target)`:
  - every base must be prime, else `FACT_CONTAIN_NOT_PRIME`;
  - the expression must equal `target`, else `INCORRECT_ANSWER`, which takes precedence;
  - evaluation is guarded: if `exp > bitLength(target) + 1` or a running product exceeds `target`, the result is `INCORRECT_ANSWER` without computing the full power.
- `src/utils/play-card.ts` keeps its exported names for the UI. `concatCardNumbers` and `evalFactCardIds` keep returning `number` for UI preview; they are documented as display-only. `isValidFactCardIds` and `isValidFactCardIdsStrict` delegate to `src/game/factor.ts`, so the UI's local validation matches the server.

### 7.4 Ported tests and changed expectations

Port every case from `src/partykit/room/logic/game-rule/game-rule.test.ts`, `game-party.test.ts` and `src/utils/play-card.test.ts` into `src/game/*.ported.test.ts`. Intentional changes, each marked with `// CHANGED: <reason>`:
- the observer-related constructor cases (observers are no longer in playOrder);
- `2^4^5`: was invalid because "the middle element is not prime"; now invalid because towers are malformed;
- `2^3^4` evaluation: it was a right-associative evaluation test, so keep it as an eval test of the display-only `evalFactCardIds` in `play-card.test.ts`, and add an engine test that towers are rejected;
- the hygiene fixes from rules §8.17 (the wrong comment at `game-rule.test.ts:21`, the array passed as a `SubmitCardSet`, the empty test).

New tests, from rules §9's untested list and the decisions in this spec:
- draw on an empty deck (rejected); a second draw (rejected);
- 3- and 4-player flow rotation through passes and failures;
- 57 on a non-empty field; 57 as the winning play; `3*19` in factor mode cuts; a failed 57 does not keep the turn;
- winner detection; a short-deck penalty;
- duplicate ids in `submit`, in `factor` and across both;
- rejected moves leave the state deep-equal (including `drawRight`);
- exponent 1 rejected; towers rejected; numbers of 30 and more cards (BigInt); exponent-cap short-circuit;
- forfeit cases: current player, deckTopPlayer (immediate flow), down to the last standing seat, card conservation;
- `timeoutPass` equals `pass` (flow included).

Property tests (`fast-check`, seeded) over random legal and illegal move sequences check:
- card conservation: the multiset of hands, field and deck equals the initial deck;
- `currentPlayer ∈ playOrder`;
- a rejected move leaves the state unchanged;
- `winner != null` exactly when some hand is empty;
- `turn` is monotonic.

---

## 8. Lobby and room creation

### 8.1 Router (`worker/src/index.ts`)

| Method and path | Target | Notes |
|---|---|---|
| `GET /lobby` (WS upgrade) | LobbyDO | home page counters |
| `POST /rooms` | LobbyDO `allocate()` | → `{roomId}` |
| `GET /rooms/:id` | RoomDO `info()` | → `{exists, status, members, connected, capacity: 12}` |
| `GET /rooms/:id/ws` (WS upgrade) | RoomDO | room session |
| `GET /healthz` | Worker | `ok` |

- The room id must match `^[A-Za-z0-9_-]{1,32}$`, otherwise 404.
- CORS allows `ALLOWED_ORIGINS` (comma-separated). An upgrade with an Origin outside the list gets 403. Requests without an Origin are allowed for HTTP (server-to-server from Vercel) and rejected for upgrades.
- DOs are created with `locationHint: 'apac'`.

### 8.2 LobbyDO

- **`allocate()`.** Find the smallest prime below 10^6 whose row has neither `count > 0` nor `reserved_until > now`. Upsert it with `reserved_until = now + 10 min`. This runs atomically in the single-threaded DO.
- **`report(id, count, status)`.** Called by RoomDO through RPC whenever its connected-member count changes, piggybacked every 5 min on the room's sweep while count > 0. A report with `count = 0` deletes the row unless it is reserved.
- **`release(id)`.** Called on room GC. Deletes the row.
- **Stale cutoff.** Rows with `count > 0` and `updated_at` older than 12 min are dropped (rooms that died without reporting). This is checked during alarm runs and on every read.
- **Lobby sockets.** Hibernatable sockets. `lobby` is the number of attached sockets. On connect, the socket gets the current stats immediately. On changes, a broadcast of `{t:'lobby', lobby, room: Record<id,count>}` is debounced through the alarm (at most one per second; never with `setTimeout`).
- **No wipe on start.** The lobby keeps its rows across restarts.
- **Home page.** `online = sum(room) + lobby`, and `rooms = keys(room).length`. This is the same arithmetic as today, now with honest inputs.

### 8.3 `/room/new`

The server component calls `createRoom()` (`src/lib/realtime-http.ts`): `fetch(POST {RT}/rooms, {cache:'no-store', signal: AbortSignal.timeout(10_000)})`, then `redirect('/room/<roomId>')`. On failure it throws, which shows the existing `error.tsx`.

---

## 9. Client data layer

### 9.1 Files (new)

- `src/app/room/[id]/session/types.ts` (frozen contract, created in the foundation):

```ts
export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error' | 'waiting-sync'
export type CloseReason = 'superseded' | 'left' | 'room-full' | 'bad-name' | 'upgrade-required' | 'room-gone' | null
export type SessionPresence = { id: string; name: string; status: 'ready' | 'not-ready'; role: 'player' | 'observer'; connected: boolean }
export type TransitionMsg = T.SystemMessage | { action: 'snapshot' } | { action: 'change-rule'; rule: PrimeDaifugoSetupData; by: string }
export type SessionTransition = { prev: ClientGameStateBundle | null; next: ClientGameStateBundle; msg: TransitionMsg; event: RoomEvent | null }
export type RoomSession = {
  selfId: string | null
  connection: ConnectionState
  closeReason: CloseReason
  presence: SessionPresence[]
  roomStatus: RoomStatus | null
  rule: PrimeDaifugoSetupData
  game: ClientGameStateBundle | null      // { gameState, ctx } in the UI shape (§9.3)
  version: number
  clock: TurnClock                         // existing TurnClock store; driven from deadline
  subscribe(listener: (t: SessionTransition) => void): () => void
  actions: {
    setReady(): Promise<AckResult>; unsetReady(): Promise<AckResult>
    changeRule(rule: Partial<PrimeDaifugoSetupData>): Promise<AckResult>
    startGame(): Promise<AckResult>        // sends expectedVersion = current version
    draw(): Promise<AckResult>; pass(): Promise<AckResult>   // send current turn
    submit(set: { submit: CardId[]; factor: FactCardId[] }): Promise<AckResult>
    leave(): Promise<void>; reconnect(): void
  }
}
export type AckResult = { ok: true } | { ok: false; reason: RejectReason | 'timeout' | 'disconnected' }
```

- `transport.ts`: the `RoomTransport` interface `{connect(url), send(text), close(code?), onOpen, onMessage, onClose(code), onError, readyState}`.
- `ws-transport.ts`: the production reconnecting WebSocket. It implements backoff, the terminal close codes, ping/liveness and the visibility/online/pageshow triggers.
- `client-reducer.ts`: the pure `clientReduce(state, frame) → {state, transitions[], acks[]}`. It implements the seq/epoch rules of §6.4.
- `adapter.ts`: the pure `viewToBundle(view, selfId)` and `eventToSystemMessage(e, members)`.
- `server-clock.ts`: offset estimation plus the deadline→seconds interval driving `TurnClock`.
- `use-room-session.ts`: the React hook gluing the pieces together. It resolves pending acks by `id`, with a 10 s timeout returning `{ok:false, reason:'timeout'}`.
- `src/test-mocks/room-transport.ts`: a test fake with the familiar control style: `control.last().__open()`, `__emit(frame)`, `__close(code)`, `__error()`, `sent()`, `lastCmd()`.

### 9.2 Mapping to the existing UI

| Old (`game-board.tsx`) | New |
|---|---|
| `ws.id` | `session.selfId` |
| `ClientMessenger.x({ws})` | `session.actions.x()` |
| `connectionStateOf({readyState, roomStatus, hasGameState, errored})` | `session.connection` |
| `useMessageHandler({...})` | `session.subscribe(t => direct(t.prev, t.next, t.msg))`; on `msg.action==='snapshot'` set state only |
| presence `status` observer guard (`not-ready`) | `presence.role === 'observer'` / `selfId ∉ game.ctx.playOrder` |
| `left-time` ticks plus client auto-pass | `session.clock` (deadline-driven); auto-pass deleted |
| 「時間切れです」 on `leftTime===0` | on `t.event?.type==='passed' && t.event.reason==='timeout'` |
| winner name from the `game-end` payload | `t.event.winnerName`, with `winnerId` available too |

`adapter.ts` builds `T.SystemMessage` like this:
- `game-started` → `{action:'game-start'}`
- `drew` → `{action:'draw', commander:{id,name}}`
- `passed` → `{action:'pass', ...}`
- `submitted` → `{action:'submit', commander, submissionResult:{submitCardSet:{submit,factor}, result}}`
- `game-ended` → `{action:'game-end', winner: name}`
- `rule-changed` → `{action:'change-rule', rule}` (no `direct()`, same as today)
- `presence`, `ready-changed`, `forfeited` and `member-left` update presence only. A `forfeited` event also emits a `snapshot`-type transition so seats and the field re-render without bogus flights.

### 9.3 UI-facing state shape (`src/shared/client-state.ts`, foundation)

```ts
type ClientPlayer = { hand: CardId[]; handCount: number; drawRight: boolean }   // hand = [] for others
type ClientGameState = { players: Record<Pid, ClientPlayer>; field: CardId[][]; deckCount: number; deckTopPlayer: Pid | null; rule: PrimeDaifugoSetupData; winner: Pid | null; lastSubmitError: SubmitResultCode | null }
type ClientCtx = { currentPlayer: Pid; playOrder: Pid[]; turn: number; deadline: number | null }
type ClientGameStateBundle = { gameState: ClientGameState; ctx: ClientCtx }
```

The pure board modules switch to these types (client R2 option a):
- `seat-model.ts` reads `handCount`;
- `board-state.ts` `handOf`/`handSize` read `handCount`, and `winnerIdOf` prefers `gameState.winner`;
- `flight-plan.ts` `arrivedCards` uses the `handCount` delta for other players and the id diff for self;
- `classify-transition.ts` computes penalties from `handCount`;
- `game-board.tsx` reads `deckCount`.

### 9.4 Small presentational additions (owned by the board/room tasks)

- `Seat`: optional `connected?: boolean`. When it is `false`, the seat gets a dashed ◌ outline and the aria label suffix 「（再接続中）」.
- `ConnectionOverlay`: optional `reason?: CloseReason`. For `superseded` it shows 「別のタブで開かれています」 and the button 「このタブで再開」. For `room-gone` it shows 「この部屋は閉じられました」 and a link to `/`.
- `GameSetDialog`: optional `selfReady?: boolean`, `onToggleReady?: () => void`, `isObserver?: boolean`, which add the 「次のラウンドに参加」/「準備OK」 toggle.
- `RoomHeader`: optional `onLeave?: () => void`, which adds the 「退出」 button with a confirmation dialog.

---

## 10. Local development

- `npm run dev` runs `concurrently -k -n web,rt "next dev" "npm:dev:server"`.
- `npm run dev:web` runs `next dev`.
- `npm run dev:server` runs `WRANGLER_SEND_METRICS=false wrangler dev -c worker/wrangler.jsonc --port 8787 --local --persist-to .wrangler/state`.
- **Offline.** `wrangler dev` runs workerd locally with local SQLite DO storage and needs no login. Check this in the foundation spike by running it with networking disabled. If the update check delays startup, set `WRANGLER_LOG=error` and document it.
- Committed `.env.development` holds `NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:8787`. `worker/wrangler.jsonc` `vars` holds the dev `ALLOWED_ORIGINS` (`http://localhost:3000,http://127.0.0.1:3000,http://localhost:3123,http://localhost:3124`) and the default grace and TTL values. `worker/.dev.vars` (gitignored) can override them, for example `GRACE_PLAYING_MS=5000` for manual testing.
- `next dev` alone still serves `/labo/gallery` and the static pages. The home page lobby socket fails silently and the counters stay at "—". `scripts/screens.mjs` ignores connection errors to `:8787` instead of `:1999`.
- Two browser contexts with `name` cookies `alice` and `bob` can play a full game. This is automated as the E2E.
- `.gitignore` adds `.wrangler/`, `worker/.dev.vars`, `test-results/` and `playwright-report/`.
- The README note to keep: `next dev`/`next build` may rewrite `package-lock.json`, and that change should not be committed.

---

## 11. Deployment (documented only; **do not deploy as part of this work**)

1. **Cloudflare (Worker).**
   - Recommended: **Workers Builds** (Git integration) on `main`, running `npx wrangler deploy -c worker/wrangler.jsonc`.
   - Manual alternative: `npm run deploy:server`.
   - Production `vars` set in `wrangler.jsonc` `env.production`: `ALLOWED_ORIGINS=https://<prod-domain>,https://<project>-*.vercel.app`. Grace values stay at their defaults.
   - The migration tag `v1` declares `new_sqlite_classes: ["RoomDO","LobbyDO"]`. The Free plan requires SQLite-backed classes.
   - A custom domain (`rt.<domain>`) is recommended over `workers.dev`.
   - Configure a usage notification for the DO free-tier limits.
2. **Vercel.** The existing Git integration. Set `NEXT_PUBLIC_REALTIME_URL` for Production and Preview. `next.config.mjs` fails the build when `VERCEL_ENV==='production'` and the value is missing or points at localhost or 127.0.0.1.
3. **Order.** Deploy the Worker first. It accepts `pv` and `pv-1`. Then deploy Vercel. A Worker deploy restarts every DO and drops every socket. Clients reconnect within about 1 s, RQ-S19 keeps everyone's turns and seats, and the welcome replay or snapshot restores the boards.
4. **Rollback.** `wrangler rollback`, and a redeploy of the previous build on Vercel. Room state is forward-compatible: `schema` is checked on load, and an unknown schema starts a fresh room.
5. **Cost.** $0 on Workers Free plus Vercel Hobby at hobby traffic. Duration (GB-s) is the tightest limit, and hibernated time is not billed. The way out is Workers Paid at $5 a month.
6. README sections "Getting Started", "バックエンド" and "6. デプロイメント" are rewritten. `docs/realtime/runbook.md` covers the deploy steps above, the env matrix and smoke checks.

---

## 12. Test strategy

| Layer | Where | Runs in | Proves |
|---|---|---|---|
| **L1 engine** | `src/game/**/*.test.ts` | `npm test` (node env) | RQ-R*, property invariants |
| **L2 session** | `src/session/**/*.test.ts` | `npm test` | RQ-S*, RQ-T* with SimClock, fake and real engine |
| **L2h host** | `worker/test/*.test.ts` (no `cloudflare:*` imports) | `npm test` | persist-before-send ordering, ring replay, reconcile on wake, supersede and sockets, alarm scheduling, lobby allocation and stale handling, Origin and route checks |
| **L3 workerd** | `worker/test/integration/*.test.ts` | `INTEGRATION=1 npm run test:integration` | the real DO: hello→welcome, reload with the same sid, forced close and reconnect, grace expiry with short vars, a restart preserving state (`dispose()` then restart on the same persist dir), an alarm timeout, 4001 |
| **C client** | `src/app/room/[id]/session/*.test.ts`, board tests, `game-board.test.tsx`, page tests | `npm test` (jsdom) | the adapter, client reducer seq/epoch/gap rules, transport backoff, terminal codes and visibility, deadline clock, game-board wiring |
| **L4 E2E** | `e2e/*.spec.ts` | `E2E=1 npm run test:e2e` (Playwright Chromium, local `wrangler dev` plus `next dev -p 3124`, short grace vars) | the multi-client scenarios below |

### 12.1 L2 simulator (`src/session/sim/`)

- `SimClock`: a virtual-time priority queue. `advance(ms)` fires alarms at `wakeAt`. Alarms are delivered at least once, and with a seeded probability twice.
- `SimHost`: a pure in-memory host mirroring the DO host semantics: persist, ring, reconcile, supersede, `connNo`. It also offers `crashRestart()`, which serializes state and the ring, drops every socket and runs reconcile.
- `SimClient`: holds `lastSeq` and `epoch` and applies frames with a minimal client model. The integration task switches it to the real `clientReduce`.
- `SimNetwork`: seeded faults: delay, drop with a close, half-open drop (no close until the sweep), duplicate hello, a second tab (supersede), a reload (new socket with the same sid and `lastSeq`), and offline for a duration.
- **Scripted scenarios** (each a named test):
  - reload mid-turn;
  - a 3 s blip on your own turn (replay, no snapshot);
  - a phone asleep 90 s on its turn (capped 20 s timeouts, then back);
  - asleep past grace (forfeit, cards back in the deck);
  - the last connected player asleep 20 min (the game resumes, no GC);
  - all disconnected for 31 min (GC);
  - duplicate tabs;
  - two simultaneous starts;
  - deckTopPlayer forfeits;
  - the winner disconnects on the winning move;
  - a mid-game joiner observes and then plays the next round;
  - a rule change seen by a late joiner;
  - leave in the waiting room and in a game;
  - a deploy (crashRestart) during someone's turn, which keeps their deadline ≥ now + 10 s.
- **Fuzz:** 200 seeds × 300 steps in `npm test`, and `SIM_RUNS=N` for more. A failure prints `SIM_SEED`, and setting `SIM_SEED` replays it. Invariants after every step:
  - §3.8 (ghost-free);
  - `version` strictly increasing;
  - `deadline != null` exactly when `status==='playing'`;
  - card conservation;
  - each client's view after catching up equals `viewFor(serverState, pid)`;
  - no frame to pid X contains a card held by another pid or the deck order;
  - **liveness**: the game reaches `waitingNextRound` within `turns × timeLimit + GRACE` under any fault pattern, given a bounded move policy.

### 12.2 E2E scenarios (Playwright, two contexts with alice and bob cookies)

1. alice creates a room through `/room/new`, bob joins by URL, both press 準備OK, ゲーム開始, and alice plays a card (or passes).
2. **bob reloads mid-game**: same `seat-<pid>` layoutId, the same hand card ids and the same turn state.
3. `context.setOffline(true)` for 3 s, then back online: no 「退出」 notice and the board resumes.
4. bob goes offline on his turn: the server auto-passes after the capped deadline, and alice sees the turn move to her.
5. bob stays offline past `GRACE_PLAYING_MS=5000`: he forfeits and alice wins (last standing), and the GAME SET dialog opens.
6. A duplicate tab for bob: the first tab shows 「別のタブで開かれています」, and 「このタブで再開」 takes the seat back.
7. Explicit 退出: confirm, navigate to `/`, and alice sees bob removed.
8. Lobby counters on `/` reflect one room with two players.

### 12.3 Coverage thresholds (`vitest.config.ts`)

- `src/game/**`: lines 95, branches 90.
- `src/session/**`: lines 90, branches 80 (the `sim/**` harness is excluded from the threshold but runs).
- `worker/src/**`, excluding `room-do.ts`, `lobby-do.ts` and `index.ts` (covered by L3): lines 85, branches 75.
- `src/app/room/*/session/**`: lines 85, branches 75.
- Existing: `src/design/**` and `src/app/room/*/_ui/board/**` at lines 85, branches 75, unchanged.
- Remove the `src/partykit/**` exclusion (the directory is deleted).

### 12.4 CI (`.github/workflows/ci.yml`)

The `test` job (no secrets) runs:
- `npm ci`
- `npx biome ci src worker e2e`
- `npm run typecheck` (`tsc --noEmit -p . && tsc --noEmit -p worker`)
- `npm test`
- `npm run build` (committed default URL)
- `npm run build-storybook`
- `npx wrangler deploy --dry-run -c worker/wrangler.jsonc --outdir dist-worker`

Optional jobs on `workflow_dispatch` or the label `e2e`: `integration` (`INTEGRATION=1 npm run test:integration`) and `e2e` (`npx playwright install chromium && E2E=1 npm run test:e2e`). The `NEXT_PUBLIC_PARTYKIT_HOST` secret is removed.

---

## 13. PartyKit removal

Delete:
- `src/partykit/**` and `partykit.json`;
- `src/interface/client-to-server.ts`, `server-to-client.ts` and `connection.ts` (keep `common.ts`);
- `src/app/room/[id]/client-messenger.ts` and its test;
- `useMessageHandler` in `hooks.ts` (keep `useMyField`);
- `src/test-mocks/partysocket.ts`;
- the `PARTYKIT_*` exports in `src/constants/env.ts`;
- the `dev:pk` and `deploy` scripts;
- the `partykit`, `partysocket`, `parcel-bundler` and `ts-node` dependencies (the last only if nothing uses it);
- the `.partykit` gitignore entry and `.partykit/` locally;
- `docs/design/redesign-spec.md` §0 item 7 ("design around server quirks"), replaced by a pointer to this spec.

The PartyKit code stays in the tree until the integration task's checks are green, then it is removed in one commit.

---

## 14. Decisions taken for the owner (defaults; each is one constant or one small change)

1. Grace: 120 s in a game, 60 s otherwise. After grace, forfeit (the hand returns to the deck); there is no early forfeit. A disconnected player's turns are capped at 20 s.
2. When deckTopPlayer forfeits, the field flows immediately. The alternative is to flow when the rotation would have returned to that seat.
3. Seat order is a random shuffle at every deal (a janken stand-in), and the first seat leads.
4. Anyone may change rules or start. There is no host.
5. Room cap: 4 seats plus 8 observers. If more than 4 are ready, the first 4 by `readyAt` get seats.
6. Empty-field leads are timed.
7. Towers are limited to one `^` level (prime base, exponent ≥ 2). Exponent 1 stays banned.
8. A single winner and no ranking. The GAME SET dialog keeps showing remaining hand counts.
9. Joker and the 1729 revolution stay out of scope.
10. Chat is dropped (no UI, no protocol). Random match stays a placeholder.
11. Observers and late joiners can ready up for the next round from the GAME SET dialog.
12. Ready flags are kept between rounds.

---

## 15. Implementation plan

Rules for every task:
- **File ownership is strict.** A task edits only the files in its list. It may create new files only under the directories its list marks with `/**`.
- The frozen contracts (`src/shared/**`, `src/game/types.ts`, `src/session/types.ts`, `src/app/room/[id]/session/types.ts`) are owned by the foundation. Parallel tasks may not change them. A needed change is raised for the integration task, or a local extension type is added in the task's own files.
- `src/game`, `src/session` and `src/shared` use **relative imports only** at runtime (type-only `@/` imports are allowed). They must not use Node, DOM or Workers APIs, `Math.random` or `Date.now`; time and randomness are injected.
- Each task leaves `npm test` green for its own files, and `tsc` clean except for seams the plan names explicitly (resolved in integration).
- Commit messages are in English. Nothing is deployed.

### F. Foundation (sequential, first)

**Files:**
- `package.json`, `package-lock.json`
- `tsconfig.json`, `vitest.config.ts`, `biome.jsonc`, `.gitignore`, `.env.development`, `next.config.mjs`
- `src/constants/env.ts`
- `src/shared/protocol.ts`, `src/shared/client-state.ts`, `src/shared/rule-options.ts`, `src/shared/name.ts`, `src/shared/ids.ts`, `src/shared/rng.ts`, `src/shared/*.test.ts`
- `src/game/types.ts`, `src/session/types.ts`, `src/app/room/[id]/session/types.ts`
- `src/lib/session-id.ts`, `src/lib/session-id.test.ts`
- `src/test-utils.tsx`
- Stubs whose ownership is handed over after the foundation: `src/game/engine.ts` (→ T1), `src/session/reducer.ts` and `src/session/view.ts` (→ T2), `src/app/room/[id]/session/use-room-session.ts` (→ T4), and `worker/tsconfig.json`, `worker/wrangler.jsonc`, `worker/src/index.ts` (→ T3).

**Work:**
- Add devDependencies: `wrangler`, `@cloudflare/workers-types`, `concurrently`, `fast-check`, `@playwright/test`. Pin exact versions verified with `npm view`.
- Add scripts: `dev`, `dev:web`, `dev:server`, `typecheck`, `test:integration`, `test:e2e`, `deploy:server`. Keep `dev:pk`/`deploy` until integration.
- Root `tsconfig.json` excludes `worker` and `e2e`. Vitest `unit` includes `worker/test/*.test.ts`, excludes `worker/test/integration/**`, and gets the coverage thresholds of §12.3. Add an opt-in `integration` project under `INTEGRATION=1`.
- Define every type in §4.1, §6, §7.1 and §9.1-9.3 exactly as written.
- `rule-options.ts`: `ALLOWED_RULES`, `DEFAULT_RULE` (from `GAME_CONFIG`), `parseRulePatch(p) → {ok, rule} | {ok:false}`.
- `name.ts`: `isValidName`, `normalizeName`.
- `ids.ts`: `ROOM_ID_RE`, `SID_RE`, `SID_COOKIE = 'pd_sid'`, `generateSid()` (Web Crypto), close codes and `PV`.
- `rng.ts`: `mulberry32(seed)`, `cryptoRng()`, `shuffle(arr, rng)`.
- `env.ts`: `REALTIME_URL`, plus the `wsUrl(path)` and `httpUrl(path)` helpers. Keep the old PARTYKIT exports.
- `next.config.mjs`: the production guard.
- `test-utils.tsx`: add `makeClientGameState`, `makeClientCtx`, `makeView`, `makeMember` and `frames.*` builders. Keep the old builders.
- Biome: restrict `setTimeout`/`setInterval` in `worker/src/**`.
- **Spike:** check that `wrangler dev` starts offline. Record the result in `docs/realtime/spike-notes.md`.

**Acceptance:** `npm test`, `npm run typecheck` (worker stub included) and `npm run build` pass. The zod schemas round-trip fixtures (tests). `parseRulePatch` rejects out-of-set values. `isValidName` matches the middleware cases.

### Parallel tasks (after F)

| Key | Title | Owns |
|---|---|---|
| T1 | Rules engine | `src/game/**` (except `types.ts`), `src/utils/play-card.ts`, `src/utils/play-card.test.ts` |
| T2 | Session reducer and simulator | `src/session/**` (except `types.ts`) |
| T3 | Worker host, DOs and router | `worker/**` |
| T4 | Client session layer | `src/app/room/[id]/session/**` (except `types.ts`), `src/test-mocks/room-transport.ts` |
| T5 | Board view-model and presentational edits | `src/app/room/[id]/_ui/board/**`, `src/app/labo/gallery/**` |
| T6 | Room page wiring | `src/app/room/[id]/_ui/{game-board,waiting-room,notification-message,RoomHeader}.*`, `src/app/room/[id]/{hooks,room-manager,page,layout,client-messenger}*`, `src/test-mocks/room-session.ts` |
| T7 | Entry, lobby and identity | `src/middleware.ts`, `src/middleware.test.ts`, `src/app/login/page.tsx` (+test), `src/app/page.tsx` (+test), `src/app/room/new/page.tsx` (+`page.test.tsx`), `src/lib/realtime-http.ts` (+test), `src/lib/use-lobby-stats.ts` (+test) |
| T8 | Ops, E2E and docs | `README.md`, `.github/workflows/ci.yml`, `e2e/**`, `scripts/screens.mjs`, `scripts/flights.mjs`, `docs/realtime/runbook.md` |

The exact file lists and acceptance criteria are in `implementation-plan.json`. Summary:

- **T1.** Implement §7 against the frozen `GameEngine`. Port and extend the tests (§7.4), with property tests. Accept when the coverage threshold is met, every pinned case is ported or marked CHANGED, and `play-card.ts` keeps its exported API.
- **T2.** Implement `roomReduce` and `viewFor` (§3-§6), injecting `GameEngine`. The fake engine lives in `src/session/testing/`. Build the SimClock, SimHost, SimNetwork and SimClient harness, the scripted scenarios and the fuzz (§12.1). Accept when every scenario and the 200-seed fuzz pass and coverage is ≥ 90/80.
- **T3.** `room-host.ts` and `lobby-core.ts` are pure, over `HostStorage`, `HostSocket` and `Clock`. The thin `room-do.ts`, `lobby-do.ts` and `index.ts` handle routing, Origin, CORS, rate limits and payload caps. Add wrangler config, L2h tests and the opt-in L3 tests. Until T1 and T2 land, it compiles against the stubs, and the L2h tests inject a fake reducer.
- **T4.** Transport, client reducer, adapter, clock and the hook (§9). Tests use the transport fake. Accept when the adapter covers every RoomEvent, the gap/epoch/duplicate rules are tested, terminal codes do not reconnect and the visibility trigger is tested.
- **T5.** The `handCount`, `deckCount` and `winner` reads; types re-pointed to `@/shared/client-state`; the `Seat connected` prop, the `ConnectionOverlay reason` prop and the `GameSetDialog` ready-toggle props (§9.4); gallery fixtures retyped. Accept when board tests and the gallery pass, coverage thresholds hold and `npm run screens` is unchanged visually except for the new states.
- **T6.** Rewire `game-board.tsx` to `useRoomSession` (mocked through `src/test-mocks/room-session.ts`). Remove `useMessageHandler`, the client auto-pass and `client-messenger`. Add the header 退出 button, the GAME SET ready toggle and the timeout log from the event. Accept when the `game-board.test.tsx` role and text assertions are kept and the order and timer tests are updated (§9.2).
- **T7.** The middleware issues `pd_sid` and uses `isValidName`. The login page ensures the sid. The home counters come from the lobby WS (`use-lobby-stats`). `/room/new` uses `createRoom()`. Accept when the tests cover the cookie issue, the callback redirect, "—" before data, and the error path to `error.tsx`.
- **T8.** README rewrite, CI (§12.4), Playwright config and the E2E specs (§12.2), the screens/flights filter moved to `:8787`, and the runbook. Specs are written against the role and text selectors defined in this spec and finalized in integration.

### I. Integration (sequential, last)

- Replace the stubs' seams.
- Switch `SimClient` to the real `clientReduce`. Add `src/session/sim/real-engine.fuzz.test.ts` (real engine, real client reducer).
- Fix cross-task type seams (T5 props consumed by T6, T4 hook consumed by T6).
- Remove PartyKit (§13), update `docs/design/redesign-spec.md` §0, and remove the old test-utils builders.
- Run every check:
  - `npm run biome:ci`/`npx biome ci src worker e2e`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run build`, `npm run build-storybook`, `npm run screens`;
  - `INTEGRATION=1 npm run test:integration`;
  - `E2E=1 npm run test:e2e`;
  - the worker dry-run bundle.
- Run the manual phone checklist (iOS Safari background 2 min, Android tab discard, airplane mode 10 s) against local dev on the LAN.
- Accept when every RQ in §1 maps to at least one passing test (a traceability table in `docs/realtime/traceability.md`) and nothing is deployed.

## Owner decisions (confirmed 2026-11-25)

- Grace period: 120 s in game / 60 s in waiting room; disconnected player's turns capped at 20 s.
- Exponents: single level only (prime base, exponent ≥ 2).
- Seat order: shuffled at every deal.
- Chat dropped; no host (4 players + 8 observers); Cloudflare free tier with usage alert; JS-readable session token accepted.
