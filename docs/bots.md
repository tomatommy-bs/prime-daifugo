# CPU（bot）席

A room member can add CPU seats in the waiting room. A bot seat behaves like any other player:
the session reducer moves it on its turn through the same engine path as a human command.

## Session rules (`src/session/`)

- `add-bot { level }` / `remove-bot { pid }`: allowed only between games. At most
  `maxSeats - 1` (3) bots, so one seat is always left for a human. The members count against the
  room capacity.
- A bot member has `bot: 'weak' | 'normal' | 'strong'`, pid `bot-<n>` (the lowest free n) and the
  name `CPU<n>（<level>）`. It is always `connected` and `ready`. It never gets a grace period, and
  `reconcile` ignores it.
- `connectedCount` counts humans only, so the lobby count and room GC ignore bots.
- `start` needs at least one human. Ready humans are seated before ready bots.
- The turn: when a bot takes the turn, `game.botAt = now + think`. The think time is uniform in
  `[botThinkMinMs, botThinkMaxMs)`. `botAt` is part of `wakeAt`, and the `tick` that reaches it
  runs the bot's move. After a draw the bot acts again `botAfterDrawMs` later, on the same turn.
- A bot is armed only while some human is connected. With nobody watching, the turn simply times
  out. The bot is re-armed when a human connects again.

## Decision (`src/bot/`)

The bot reads only what its seat can see: its own hand, the field, every hand's card count and
the deck size. The search works on card ranks (1..13), not card ids. `ranks.ts` precomputes every
spelling of 1–4 ranks once (13 + 13² + 13³ + 13⁴), split into playable spellings (prime or 57)
and composite ones. Generating moves then means filtering that table by the hand's rank counts,
so the cost does not grow with the hand size. The bot never plays more than 4 cards, and so it
cannot beat a field of 5 or more cards.

| Level | Policy |
|---|---|
| よわい `weak` | A random prime play. 25% of the time it overlooks every play (it draws, then passes). 10% of the time it submits a composite that looks prime and takes the penalty: the composite is odd, does not end in 5, and its digit sum is not a multiple of 3. |
| ふつう `normal` | Greedy. Each play is scored as described under "Greedy score" below. |
| つよい `strong` | The greedy shortlist (top 6, plus pass when following), evaluated by Monte Carlo playouts (see "Monte Carlo playouts" below). |

### Greedy score

Each play scores:

- `10 × cards shed`, counting composite plays together with their factor cards;
- `+15` for 57;
- `+1.5 × the distinct 1–2-card primes the rest of the hand can still make`;
- when following, `−6 × strength`, where strength is the play's percentile among the playable
  numbers with the same card count. This means it beats the field with the lowest number that
  works. The sign flips to `+6 × strength` when an opponent holds 2 or fewer cards.

A play that empties the hand always wins. When the bot has no play, it draws, then passes.

### Monte Carlo playouts

For each of 8 deals, the cards the bot cannot see are re-dealt at random (`determinize`). Every
candidate is then played out up to 48 moves with a fast greedy policy (prime plays only). Each
playout scores 1 for a win, 0 for a loss, and otherwise 0.5 ± the card lead. All candidates share
the same random numbers for a given deal. Ties keep the greedy order.

### Measured strength (2 players, 11 cards)

| Match | Wins |
|---|---|
| ふつう vs よわい | 152 / 200 |
| つよい vs ふつう | 62 / 100 |
| つよい vs よわい | 88 / 100 |

A つよい decision takes up to about 85 ms (p95 about 50 ms) in Node. This is well within the
Worker's CPU budget.
