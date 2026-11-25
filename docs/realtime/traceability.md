# Realtime rebuild: requirement traceability

Every requirement in [`rebuild-spec.md`](./rebuild-spec.md) §1 mapped to the tests (or build checks) that prove it. Test references are `file › test name`. All listed tests passed on `feature/realtime-rebuild` at the integration commit.

How each layer runs:

| Layer | Command |
|---|---|
| L1 engine, L2 session (simulator and fuzz), L2h host, C client | `npm test` (`npm run test:coverage` adds the §12.3 thresholds) |
| L3 workerd | `INTEGRATION=1 npm run test:integration` |
| L4 E2E (Playwright, local `wrangler dev` + `next dev`) | `E2E=1 npm run test:e2e` |
| B build and CI | `npx biome ci src worker e2e`, `npm run typecheck`, `npm run build`, `npm run build-storybook`, `npm run test:storybook`, `npm run screens`, `npx wrangler deploy --dry-run -c worker/wrangler.jsonc --outdir dist-worker` |

Short names used below:

- `engine` = `src/game/engine.test.ts`, `ported` = `src/game/engine.ported.test.ts`, `factor` = `src/game/factor.test.ts`, `property` = `src/game/engine.property.test.ts`
- `reducer` = `src/session/reducer.test.ts`, `scenarios` = `src/session/sim/scenarios.test.ts` (runs with the fake **and** the real engine), `fuzz` = `src/session/sim/fuzz.test.ts`, `real-fuzz` = `src/session/sim/real-engine.fuzz.test.ts` (real engine + real `clientReduce`)
- `host` = `worker/test/room-host.test.ts`, `lobby` = `worker/test/lobby-core.test.ts`, `http` = `worker/test/http.test.ts`, `L3 room` / `L3 lobby` = `worker/test/integration/{room,lobby}.integration.test.ts`
- `session/*` = `src/app/room/[id]/session/*.test.ts(x)`, `game-board` = `src/app/room/[id]/_ui/game-board.test.tsx`
- `E2E session` = `e2e/session.spec.ts`, `E2E game` = `e2e/game.spec.ts`, `E2E lobby` = `e2e/lobby.spec.ts`

The fuzz invariants (`src/session/sim/invariants.ts`, checked after every simulated clock step) are cited as **fuzz invariants**: ghost-free members and sockets (§3.8), `version` strictly increasing, `deadline` exactly while `playing`, card conservation, caught-up view equals `viewFor`, no frame leaking another player's cards or the deck, and liveness. Liveness is checked two ways: turn by turn after every clock step (`SimWorld.checkTurnLiveness`: a running turn's deadline is never more than its time limit, or the 10 s restart floor, away, and once it has passed by more than 1 s the turn has moved on or the game has ended; with a bounded number of turns this bounds the time in `playing` under any fault pattern), and by a final drain (every tab closed: the game ends and the room is collected). `real-fuzz` adds: each caught-up client's UI bundle equals `viewToBundle(viewFor(server, pid))`.

## Rules (RQ-R)

| ID | Requirement | Tests |
|---|---|---|
| RQ-R1 | 52-card deck, ids `<num><suit>` | `src/game/cards.test.ts` › RQ-R1: the full deck is 52 distinct cards with no joker |
| RQ-R2 | Card values | `src/game/cards.test.ts` › RQ-R2: card values |
| RQ-R3 | Concatenated numbers, BigInt | `src/game/numbers.test.ts` › concatValue (RQ-R3) › writes card values side by side in play order; › is exact for numbers of 30 and more cards (BigInt); `engine` › numbers of 30 cards are judged exactly (BigInt) |
| RQ-R4 | Client hand sort by value, then S<H<C<D | `src/utils/play-card.test.ts` › display helpers › compareCard orders by value, then suit S<H<C<D |
| RQ-R5 | `halfEvenNumbers` removes 12 cards | `src/game/cards.test.ts` › RQ-R5: halfEvenNumbers removes 2,4,6,8,10,Q of hearts and diamonds; `engine` › setup › uses the half-even deck |
| RQ-R6 | 2-4 playing seats; observers never get a turn | `engine` › setup (RQ-R6, RQ-R7) › rejects fewer than 2, more than 4, or repeated seats; `reducer` › start › seats the first 4 ready+connected members by readyAt in a shuffled order; `E2E game` › an observer joins mid-game and takes a seat in the next round |
| RQ-R7 | Deal, `drawRight`, deck-size check | `engine` › setup › deals initNumCards to each seat in the given order with drawRight; › checks the deck size against initNumCards × seats |
| RQ-R8 | Only the current player moves; others rejected, nothing broadcast | `engine` › turn ownership (RQ-R8) › rejects draw, pass and submit from anyone but the current player; `reducer` › moves › rejects moves outside a game, with a stale turn, or from the wrong seat |
| RQ-R9 | One draw per turn, non-empty deck | `engine` › draw (RQ-R9) › takes the last deck card, keeps the turn and spends the draw right; › rejects a draw on an empty deck; › rejects a second draw in the same turn; › a pass and a judged submit restore the draw right |
| RQ-R10 | Pass any time on your turn | `engine` › pass and flow › a pass on an empty field moves the turn and increments turn |
| RQ-R11 | Flow (流れ) | `engine` › pass and flow › 3 players: the field flows when the turn returns to the deck-top player; › 4 players: failures count toward the rotation and the deck-top leads after the flow; › a new deck top resets the rotation |
| RQ-R12 | Submit validation order, multiset check, no state change on failure | `engine` › submit validation (RQ-R12) › empty submit; › more than maxSubmitNumCards; › cards not in hand; › duplicate ids in submit, in factor and across both; › on a non-empty field: count must match and the value must be strictly greater; › malformed factor expressions; › validation order |
| RQ-R13 | Plain/factor judging, INCORRECT_ANSWER precedence | `engine` › judging, success and penalties › INCORRECT_ANSWER wins when both factor checks fail; `factor` › checkFact (RQ-R13) (all cases); `E2E game` › a correct factorization is accepted; › a number that is not prime costs a penalty draw and ends the turn |
| RQ-R14 | Success: field set, factor cards back to a reshuffled deck, deck top | `engine` › success: cards to the field as one set, deck top set, turn moves; › factor success: factor cards go back into the reshuffled deck; `E2E game` › a correct factorization is accepted |
| RQ-R15 | Penalties from the end of the deck, short deck | `engine` › BASE_IS_NOT_PRIME draws submit.length cards from the END of the deck; › a factor failure draws submit.length plus the factor card count; › a short deck: the player draws what is left; `E2E game` › a number that is not prime costs a penalty draw and ends the turn |
| RQ-R16 | Factor syntax, one `^` level, no operand 1 | `factor` › parseFact (RQ-R16) (all cases, incl. rejects towers and exponent 1); `src/game/factor.ported.test.ts`; `src/utils/play-card.test.ts` › isValidFactCardIds › matches the rules engine exactly |
| RQ-R17 | 57 cut | `engine` › 57 cut (RQ-R17) › plain 57 on an empty field keeps the turn…; › 57 on a non-empty field; › 3*19 in factor mode cuts; › a failed 57 does not keep the turn; › 57 as the winning play; `reducer` › moves › a 57 cut keeps the turn but restarts the deadline |
| RQ-R18 | Empty hand wins, also on a 57 cut and while disconnected | `engine` › end of game › emptying the hand wins…; › a plain winning submit; › a winning factor submit; `scenarios` › the winner disconnects on the winning move: the game still ends with them as winner; `E2E game` › three players play a whole game to GAME SET |
| RQ-R19 | Moves after the end are `bad-status` | `engine` › after the end every move is bad-status; `reducer` › moves › rejects moves outside a game… |
| RQ-R20 | Pure, deterministic, JSON round trip | `engine` › is deterministic for a seed and differs across seeds (RQ-R20); › a game exported to JSON and re-imported continues identically (RQ-R20); `reducer` › purity › never mutates its input; › is deterministic for a seed |
| RQ-R21 | Every pinned old test ported or marked CHANGED | `ported` (15 cases, header lists counts and CHANGED cases); `src/game/factor.ported.test.ts` |
| RQ-R22 | Allowed rule values; server rejects others | `src/shared/rule-options.test.ts` › ALLOWED_RULES › lists the waiting-room choices (RQ-R22); › parseRulePatch; `reducer` › ready / set-rule › stores a valid rule and rejects out-of-set values (RQ-S11, RQ-R22) |

Property tests (`property` › move-only sequences keep every invariant; › sequences with forfeits keep conservation, order and turn invariants; › the generators reach accepted submits, penalties, 57 cuts and wins) back RQ-R8..RQ-R20 with card conservation, `currentPlayer ∈ playOrder`, unchanged state on rejection, winner ⇔ empty hand, and monotonic `turn`.

## Session and room (RQ-S)

| ID | Requirement | Tests |
|---|---|---|
| RQ-S1 | Stable `pid` from `sid` across reload, reconnect, redeploy | `host` › derives the pid from the sid and welcomes with a snapshot; › RoomHost with the real reducer and engine › a reload with the same sid restores the same seat and hand by replay; `L3 room` › reconnecting with the same sid restores the same seat and hand; `scenarios` › reload mid-turn keeps the seat, the hand and the turn; `E2E session` › 2. bob reloads mid-game and keeps his seat, hand and the turn; `E2E game` › a Worker restart mid-game keeps every seat, hand and the turn; `src/lib/session-id.test.ts` (all) |
| RQ-S2 | Server name rule (3-10 after trim); never a raw id as a name | `src/shared/name.test.ts` (all); `src/middleware.test.ts` › name gate; `reducer` › connect › rejects a bad name with bye 4003 and changes nothing; `session/adapter` › never shows a raw pid as a name; `src/app/room/[id]/_ui/board/seat-model.test.ts` › shows ??? (never the raw pid) when a player has no presence entry |
| RQ-S3 | One seat per pid, newest tab wins (4001), old tab does not reconnect | `reducer` › connect › newest connection wins: the old socket gets bye superseded 4001; `host` › supersedes the old socket of the same pid with 4001 (newest wins); `L3 room` › a second socket with the same sid supersedes the first (4001); `session/ws-transport` › does not reconnect after a bye frame, whatever the close code; `scenarios` › duplicate tabs…; `E2E session` › 6. a duplicate tab supersedes the first, which can take the seat back |
| RQ-S4 | A close keeps the member (seat, hand, ready) for grace; no "left" broadcast | `reducer` › disconnect › keeps the member with an idle grace…; › a seated player gets the playing grace…; `host` › a client close marks the member disconnected, keeping it as a member; `E2E session` › 3. a 3 s offline blip resumes the board by replay, with no leave notice |
| RQ-S5 | Reconnect within grace restores everything; replay or snapshot | `reducer` › connect › chooses replay when the gap is still in the ring; › falls back to a snapshot…; `host` › replays missed ring events rendered per viewer…; › falls back to a snapshot when the ring no longer covers the gap; `L3 room` › a forced close and reconnect within grace replays the missed events; `scenarios` › a 3 s blip on your own turn replays the missed events (no snapshot); `session/client-reducer` › replay keeps the baseline and the following events animate; `E2E session` › 2. bob reloads…; › 3. a 3 s offline blip resumes the board by replay… |
| RQ-S6 | Grace expiry or leave forfeits a seat; last seat wins; outside a game, removal | `reducer` › tick › grace expiry forfeits a seated player and conserves cards (RQ-S6); › grace expiry outside a game just removes the member; › leave › in a two-player game: forfeit, the other seat wins (last standing); › in a three-player game: the game goes on…; `L3 room` › the alarm passes for a disconnected current player, then grace expiry forfeits; `scenarios` › asleep past grace: forfeit, cards back in the deck, the other seat wins; `E2E session` › 5. bob offline past the grace forfeits and alice wins; `E2E game` › an observer joins mid-game… (bob's 退出 mid-game) |
| RQ-S7 | Explicit leave is immediate and terminal; reload is never a leave | `session/use-room-session` › leave › sends leave, waits for the ack, then closes for good; `src/app/room/[id]/page.test.tsx` › 退出: confirm, leave the session, then go home (spec §3.6); `src/app/room/[id]/_ui/RoomHeader.test.tsx` › 退出 (onLeave); `host` › sends ack then bye{left} with 4000 on leave; `E2E session` › 7. an explicit 退出 navigates home and removes bob for alice; › 2. bob reloads… (alice never sees a leave) |
| RQ-S8 | Presence once per pid; counts by connected member | `src/session/view.test.ts` › renders the waiting room with members sorted by joinedAt; `host` › reports the connected count when it changes; `session/adapter` › viewToPresence › maps ready to status and keeps role and connected; fuzz invariants (one member and one live socket per pid, lobby count = connected members); `E2E lobby` › 8. lobby counters on / reflect one room with two players |
| RQ-S9 | Persisted room states; never reset because the last socket closed | `reducer` › disconnect › keeps the member with an idle grace and starts the GC clock when nobody is left; `scenarios` › the last connected player asleep 20 min: the room survives (no GC) and play resumes; `L3 room` › a restart on the same persist dir keeps the game… |
| RQ-S10 | Ready/unready in waiting and waitingNextRound, observers included | `reducer` › ready / set-rule › toggles ready with events and is idempotent; › next round › a mid-game joiner readies up in waitingNextRound and gets a seat; ready flags are kept; `game-board` › an observer is offered 次のラウンドに参加; `E2E game` › an observer joins mid-game and takes a seat in the next round |
| RQ-S11 | Stored rule, set-rule only between games, start uses it | `reducer` › stores a valid rule and rejects out-of-set values (RQ-S11, RQ-R22); › start › uses the stored rule; `scenarios` › a rule change is seen by a late joiner and used by start; `game-board` › a rule change sends only the patch and shows the server-stored rule |
| RQ-S12 | Start gate, `expectedVersion`, first 4 by readyAt, setup before status | `reducer` › start › seats the first 4 ready+connected members by readyAt…; › needs two ready connected members; › a stale expectedVersion is rejected, so two simultaneous starts deal once; › a setup failure leaves the room unchanged; `scenarios` › two simultaneous starts deal once; `src/app/room/[id]/_ui/waiting-room.test.tsx` › does not count a ready but disconnected member toward the start gate |
| RQ-S13 | Mid-game joiner observes, no hand, can ready for next round | `reducer` › connect › a member joining mid-game is an observer without a hand (RQ-S13); `scenarios` › a mid-game joiner observes and then plays the next round; `game-board` › a late joiner (ready, but not in the play order) watches without a hand; `E2E game` › an observer joins mid-game and takes a seat in the next round |
| RQ-S14 | 4 seats + 8 observers; extra gets room-full | `reducer` › connect › rejects the 13th member with room-full (4002); `host` › relays room-full (4002) |
| RQ-S15 | GC after 10/30 min unattended; connect cancels | `reducer` › tick › garbage-collects an unattended room at gcAt; `src/session/timers.test.ts` › GC TTL is 10 min while waiting and 30 min otherwise; `scenarios` › all disconnected for 31 min: the room is garbage-collected and starts a new epoch; `host` › destroys the room at gcAt: room-gone, wipe, release, new epoch; `lobby` › a count of 0 hides the room but holds its id until GC could have run |
| RQ-S16 | Per-viewer redaction | `src/session/view.test.ts` › shows only the viewer's own hand and hand counts for everyone (RQ-S16); `host` › broadcasts events to other connected members, rendered per viewer; › RoomHost with the real reducer and engine › welcomes, starts a game and never sends another player their cards; fuzz invariants (no frame leaks another hand or the deck) in `fuzz` and `real-fuzz` |
| RQ-S17 | One move at a time; version = seq; persisted before sent | `host` › persists the state and ring before the first frame is sent; fuzz invariants (`version` strictly increasing); `reducer` › connect › adds a new member, emits presence and welcomes with a snapshot |
| RQ-S18 | Every command acked; rejected commands write nothing | `host` › writes nothing for a rejected command; › rate-limits to 20 commands per 5 s with an ack; `reducer` › moves › maps engine rejections and leaves the state reference-equal; `session/use-room-session` › sends commands with ids and resolves on their ack; › no ack in 10 s → timeout |
| RQ-S19 | Restart: fresh grace for dropped members, deadline ≥ now+10 s | `reducer` › reconcile (RQ-S19) (3 cases); `host` › load and reconcile (RQ-S19) (all); `L3 room` › a restart on the same persist dir keeps the game and floors the deadline at now + 10 s; `scenarios` › a deploy (crashRestart) during a turn keeps the deadline ≥ now + 10 s and every seat; `E2E game` › a Worker restart mid-game keeps every seat, hand and the turn |

## Timer (RQ-T)

| ID | Requirement | Tests |
|---|---|---|
| RQ-T1 | Absolute server deadline, reset on every turn change, not on draw | `reducer` › moves › a draw keeps the deadline; a pass starts a new one (RQ-T1); › a 57 cut keeps the turn but restarts the deadline; `src/session/timers.test.ts` › turn duration is the time limit… |
| RQ-T2 | Server timeout pass through the manual pass path | `engine` › timeoutPass (RQ-T2) › equals a manual pass by the current player, flow included; `reducer` › tick › passes for the current player at the deadline, once (RQ-T2, RQ-T6); `L3 room` › the alarm passes for a disconnected current player…; `E2E session` › 4. bob offline on his turn is auto-passed after the capped deadline |
| RQ-T3 | Disconnected current player capped at min(timeLimit, 20 s) | `reducer` › disconnect › a seated player gets the playing grace and their turn is capped at 20 s (RQ-T3); › the cap never extends a deadline that is already sooner; › a turn passing to a disconnected player gets the capped deadline; `scenarios` › a phone asleep 90 s on its turn is auto-passed within 20 s per turn, then comes back; `E2E session` › 4. bob offline on his turn… (60 s turns, moved within the 3 s E2E cap) |
| RQ-T4 | No deadline outside `playing` | `src/session/timers.test.ts` › wakeAt is the earliest of deadline, grace and GC; no deadline outside playing; fuzz invariants (`deadline != null` exactly while `playing`) |
| RQ-T5 | No per-second ticks; client renders whole seconds; 時間切れです from the server event | `session/server-clock` (all, e.g. › renders whole seconds left with the server skew applied; › ticks only while a deadline is set…); `game-board` › timer (server deadline, no client pass) › announces 残り5秒 on my turn only; › logs 時間切れです and toasts red when the server timed me out; `E2E session` › 4. … (alice's log shows 時間切れです); B: Biome `noRestrictedGlobals` bans `setTimeout`/`setInterval` in `worker/src/**` |
| RQ-T6 | Moves carry `turn`; stale rejected; duplicate alarms no-op | `reducer` › moves › rejects moves outside a game, with a stale turn, or from the wrong seat; › tick › is a no-op when nothing is due (duplicate or early alarms); › passes for the current player at the deadline, once; `fuzz` (SimClock delivers alarms twice with a seeded probability; asserts `duplicateAlarms > 0`) |

## Client (RQ-C)

| ID | Requirement | Tests |
|---|---|---|
| RQ-C1 | UI talks to the backend only through `useRoomSession` | `game-board` › GameBoard (session wiring) (all); `src/app/room/[id]/page.test.tsx` › opens the session for the room id; `session/use-room-session` (all); B: `grep -ri partykit src worker e2e package.json` is empty |
| RQ-C2 | `selfId` is the stable pid; seat layout ids stable | `session/use-room-session` › opens the room socket and maps connecting → waiting-sync → open; `game-board` › a first welcome snapshot that brings selfId and the game together still shows my hand; `E2E session` › 1. … (seat-<pid> layout ids); › 2. bob reloads… (same seat layout ids) |
| RQ-C3 | Snapshots never animate; replayed and live events do | `session/client-reducer` › snapshot applies the view without animation; › a gap applies the snap as a snapshot without animation; › replay after a reload (no baseline) catches up without animation; `game-board` › a snapshot sets the state without animation or announcements (RQ-C3) |
| RQ-C4 | `submitted` then `game-ended`; `holdEnd` works | `session/client-reducer` › a winning submit then game-ended animate in order with their own seq; `game-board` › game end ordering › opens the GameSetDialog only after the winning submit has played; `reducer` › moves › a failed submit draws the penalty; a winning submit emits submitted then game-ended |
| RQ-C5 | Connection states; reconnecting keeps the board; superseded copy and resume | `src/app/room/[id]/_ui/board/ConnectionOverlay.test.tsx` (all, incl. superseded and room-gone); `game-board` › connection states (all); `session/use-room-session` › keeps the board while reconnecting and replays from lastSeq; › a superseded bye is terminal until reconnect(); `E2E session` › 6. a duplicate tab supersedes the first… |
| RQ-C6 | Rejected submit → tray error (shake + red toast) | `game-board` › server rejections (ack ok:false) use the tray-error path (RQ-C6) › shows the reason in the tray and a silent red toast |
| RQ-C7 | Client auto-pass removed | `game-board` › sends no pass when the clock hits 0 on my turn (the server passes, RQ-C7) |
| RQ-C8 | Reconnect at once on visible / online / pageshow | `session/ws-transport` › reconnects at once on visible/online/pageshow(persisted) when not open; › leaves a fresh open socket alone but replaces one quiet for over 25 s; › force-reconnects when no frame arrives for 45 s |

## Lobby and entry (RQ-L)

| ID | Requirement | Tests |
|---|---|---|
| RQ-L1 | Home counters, "—" before data | `src/app/page.test.tsx` › shows — for every counter before the first lobby message; › shows the counts after a lobby message; `src/lib/use-lobby-stats.test.ts` (all); `E2E lobby` › 8. lobby counters on / reflect one room with two players |
| RQ-L2 | Counts survive restarts; stale rooms dropped after 12 min | `lobby` › drops rooms that stopped reporting for 12 minutes; › a periodic report keeps a room fresh; › wakes at the stale cutoff and broadcasts the drop; `host` › re-reports the lobby count every 5 minutes while members are connected |
| RQ-L3 | `/room/new` gets a fresh prime id (10-min reservation) | `lobby` › allocate (all three, incl. 50 distinct primes); › a count of 0 hides the room but holds its id until GC could have run; `L3 lobby` › POST /rooms returns distinct primes; `src/lib/realtime-http.test.ts` › createRoom (all); `src/app/room/new/page.test.tsx` (all); `E2E session` › 1. create via /room/new… |
| RQ-L4 | Any `/room/<id>` matching the pattern can be joined | `http` › matchRoute › matches the §8.1 table; › 404s bad room ids and unknown paths; `L3 lobby` › 404s a bad room id…; `E2E session` › 1. … join by URL |
| RQ-L5 | `name` cookie gate kept; middleware issues `pd_sid` | `src/middleware.test.ts` (all); `src/lib/session-id.test.ts` (all) |
| RQ-L6 | Random match and training stay disabled placeholders | `src/app/page.test.tsx` › renders disabled features as disabled buttons that are not links |

## Operations (RQ-O)

| ID | Requirement | Tests / checks |
|---|---|---|
| RQ-O1 | Frontend on Vercel; backend without PartyKit | B: PartyKit removed (`grep -ri partykit src worker e2e package.json` empty); `npx wrangler deploy --dry-run -c worker/wrangler.jsonc --outdir dist-worker` bundles; `npm run build` passes |
| RQ-O2 | One public URL; production build fails if unset or localhost | `src/constants/next-config.test.ts` › next.config.mjs production guard (RQ-O2) (all); CI builds with the committed `.env.development` default |
| RQ-O3 | $0 at hobby traffic; no always-on instance, no per-second writes | Design check: the reducer only wakes at `min(deadline, grace, gcAt)` (`src/session/timers.test.ts` › wakeAt…), no per-second ticks (RQ-T5), hibernatable sockets (`worker/src/room-do.ts`), Biome bans timers in `worker/src/**` |
| RQ-O4 | Game state survives eviction and deploys | `L3 room` › a restart on the same persist dir keeps the game and floors the deadline at now + 10 s; `E2E game` › a Worker restart mid-game keeps every seat, hand and the turn |
| RQ-O5 | `npm run dev` offline with no account; `dev:web` / `dev:server` exist | E2E runs the whole stack locally (`wrangler dev --local` + `next dev`) with no Cloudflare account; offline start recorded in `docs/realtime/spike-notes.md` (outbound traffic sent to a dead proxy); the fully network-off start is the manual check in `docs/realtime/runbook.md` §7.1 (not automated) |
| RQ-O6 | `npm test` fast, browser-free, no network; screens and Storybook tests need no backend | B: `npm test` (jsdom/node only, ~25 s); `npm run screens` (96 screenshots, only `next dev`); `npm run test:storybook` (21 files, 133 tests, no backend) |
| RQ-O7 | CI: biome, tsc (app + worker), tests, build, Storybook build, worker dry run; E2E opt-in | `.github/workflows/ci.yml` (`test` job; `integration` and `e2e` jobs only on `workflow_dispatch` or the `e2e` label) |
| RQ-O8 | No secrets committed | `.env.development` holds only `NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:8787`; `worker/.dev.vars` is gitignored (`.dev.vars.example` has no secrets) |

## Manual checks still owed

These need real devices or a network-off machine and are listed in [`runbook.md`](./runbook.md):

- `npm run dev` from a fresh clone with networking fully disabled (RQ-O5): runbook §7.1.
- Two phones on the LAN: iOS Safari in the background for 2 min, Android tab discard, airplane mode for 10 s; each keeps seat and hand (RQ-S1, RQ-S4, RQ-S5, RQ-C8). The automated equivalents are the E2E reload, blip and restart scenarios and the simulator's sleep and half-open scenarios.
