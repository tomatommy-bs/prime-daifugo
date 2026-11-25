# 素数大富豪 redesign spec: ふるい (Furui), the Sieve Table

Status: **FINAL**, the design lead's synthesis (2026-11-25). Branch: `feature/math-redesign`.

This spec starts from the consensus winner, **ふるい (Furui)**, which all three judges picked. It adds the strongest ideas from **Q.E.D. (graph-paper proof)** and **Sectio Aurea (φ / polar)**. It is the single source of truth for the implementation team. Where it conflicts with the concept drafts, this document wins.

> In one line: the table is a **sieve of Eratosthenes**, seats sit on a **residue ring ℤ/nℤ**, card backs are **Ulam spirals**, and failed numbers **split into prime factor trees**. Every number is set in tabular mono. The colour rule is **primes glow, composites stay grey**. Plays read like lines of a proof, and a game ends in **Q.E.D. ∎**.

---

## 0. Hard constraints (non-negotiable)

1. **No server or rule behaviour changes.** These must stay byte-identical in behaviour:
   - `src/partykit/**`
   - `src/utils/play-card.ts`
   - `src/interface/**`
   - `src/app/room/[id]/client-messenger.ts`
   - `src/app/room/[id]/room-manager.ts`
   - `src/middleware.ts`

   `src/app/room/[id]/hooks.ts` keeps its exported API and dispatch semantics. Only additive, non-behavioural changes are allowed there; preferably none.
2. **Wire protocol** and zod schemas are unchanged.
3. **Contracts kept:**
   - `GameBoard` named export with props `{ id: string; size?: 'S'|'M'|'L'; onLogNotification?: (m: ReactNode) => void }`.
   - `WaitingRoom` props `{ rule, onChangeRule?, presence, myPresence?, onGameStart?, onSetReady?, onUnsetReady? }`.
   - `QRButton` `{ url, popoverProps? }`.
   - `NotifyMessageContent.*` names and props.
   - `PlayingCardLine` props.
   - `GameCard` `{ card: CardId | 'Back' } & SVGProps`, sized by `fontSize`, with default `role="option"`.
   - `ClientRoomManager.canStartGame`.
   - localStorage key `cardSizeOption`, sessionStorage key `shouldShowRotateRecommender`, cookie `name` (3–10 characters, 365 days).
   - The login `callback` redirect via `location.pathname`.
   - The `/room/new` server fetch and redirect.
   - Auto-pass at `leftTime === 0`, sent only by the current player's client.
   - The observer guard in `onGameEvent`.
   - Mantine `<Notifications position="top-right">`.
   - Every server event wipes the trays (`setHandCardIds`). This stays, but now it animates and is explained.
4. **No primality spoilers.** Before a server result, the UI never says whether a number is prime. The one existing exception stays: the tray turns gold at exactly 57. Arithmetic help (card count, `>` field, factor expression `=`/`≠` its target) is allowed because it is not a primality judgement.
5. **No joker or 1729 visuals.** Neither is implemented on the server. `Seat` and `FieldStack` accept an optional `variant?: 'default'` slot for the future and nothing else.
6. **No new runtime dependencies.** Fonts come from the existing `src/fonts/Geist*.woff` via `next/font/local`. Factorization reuses the existing `primes-and-factors` dependency, with a budgeted BigInt fallback. daisyUI is **removed**: its single use is rebuilt in Mantine.
7. **Known server quirks** are designed around, not fixed:
   - Observers appear in `playOrder`, so the turn can land on an observer and no seat is lit.
   - `sync` reads storage key `'ctx'` instead of `'gameCtx'`, so late joiners see the "次のイベントを待っています…" state.
   - The timer can go negative; it displays `0`.
   - INVALID_MOVE is silent; the client shakes the tray before sending.
   - The server sends `game-end`, then `room-status`, then the winning `submit`; the director reorders them.

---

## 1. Design principles

1. **Numbers are the protagonists.** Every concatenated value (field, tray, factor expression, lobby counters, timer) is a `NumberGlyph`: Geist Mono, `tabular-nums slashed-zero`, weight 700, rolling digits. Suits and faces are supporting cast.
2. **One accent means prime.** The chrome is ink on paper. Vermilion `--prime` appears only where the game has *confirmed* a prime: a field top after success, the primary CTA, and post-result factor leaves. Composites stay grey. Learning to read the colour is learning the game.
3. **Every structure is a mathematical object.**
   - Seat order is a residue ring, so the turn pointer is `k mod n`.
   - Field history is a strictly increasing sequence: `13 < 47 < 1013`.
   - The timer is an arc of length `leftTime / timeLimit`.
   - Rules are written as axioms (`t ∈ {15 · 60 · 300}`).
   - The log is a numbered proof that ends in `∎`.
4. **Motion is derivation.** Each animation shows cause and effect: hand → tray → field, flow = sieve strike-out, NOT_PRIME = factor split. No animation is purely decorative. Durations are Fibonacci milliseconds. Springs are documented by `visualDuration` and `bounce`. Shakes are damped sines.
5. **Arithmetic help, never a primality oracle.** The field states `k = 2 枚 · > 1013`. The tray shows `枚数 ✓` and `> 場 ✓`. Factor mode shows `= 18 ≠ 17`. The rest is the player's puzzle.
6. **Phone landscape first.** The primary target is 844×390 down to 667×360. Desktop is the expanded version of the same grid. Portrait is playable.
7. **Calm by default, ceremony at three moments:** successful play, the 57 cut, and game end. Ceremonies can be skipped with a tap or Esc.
8. **Colour is never the only signal.** Every state pairs colour with a glyph or shape (■/·, ✓/✗, =/≠, `G`, ▲, ∅, `観戦`).

---

## 2. Design tokens

### 2.1 Colour (CSS custom properties, the source of truth)

These live in `src/app/globals.css`, mirrored as data in `src/design/tokens.ts`, where a test checks the contrast ratios. Dark mode is keyed on `[data-mantine-color-scheme='dark']`, which `ColorSchemeScript`/`MantineProvider` set. The default scheme is `auto`.

All ratios below are WCAG 2.x and were computed with a script (bg / surface / surface-raised).

| Token | Light | Dark | Role | Light ratio | Dark ratio |
|---|---|---|---|---|---|
| `--bg` | `#F6F4EE` | `#0D0F13` | page "paper" | – | – |
| `--surface` | `#FFFFFF` | `#161920` | panels, tray | – | – |
| `--surface-raised` | `#FFFFFF` | `#1F232C` | active seat, dialogs (light adds shadow) | – | – |
| `--ink` | `#15171C` | `#ECE9E2` | text, numbers | 16.3 / 17.9 | 15.8 / 14.5 / 13.0 |
| `--ink-muted` | `#585D69` | `#A2A7B2` | labels, inactive seats | 6.0 / 6.6 | 8.0 / 7.3 / 6.5 |
| `--line` | `#DDD9CE` | `#2A2F3A` | sieve grid, rules (decor, `aria-hidden`) | decor | decor |
| `--composite` | `#C9C5B9` | `#3A404D` | composite dots (decor) | decor | decor |
| `--border-strong` | `#878B95` | `#6E7483` | interactive borders, card hairline | 3.1 / 3.4 | 4.1 / 3.4 (raised) |
| `--prime` | `#B3361B` | `#FF8A5C` | confirmed prime, primary CTA | 5.5 / 6.1 | 8.3 / 7.6 / 6.8 |
| `--on-prime` | `#FFFFFF` | `#0D0F13` | text on prime fill | 6.1 | 8.3 |
| `--factor` | `#0E6E66` | `#2DD4BF` | factor mode, `·` and `^` | 5.6 / 6.1 | 10.3 / 9.5 |
| `--mod` | `#4338CA` | `#A5B4FC` | turn pointer, focus ring, ring geometry | 7.2 / 7.9 | 9.6 / 8.8 |
| `--gold` | `#8A5A00` | `#F5C542` | 57 Grothendieck, winner, lead ▲ | 5.4 / 5.9 | 11.8 / 10.8 |
| `--danger` | `#B42318` | `#F87171` | errors, timer ≤ 10 s, ≠ | 6.0 / 6.6 | 6.9 / 6.4 |
| `--card-face` | `#FFFFFF` | `#FFFFFF` | card ground: cards stay white in dark mode | – | – |
| `--shadow-1` | `0 1px 0 rgb(21 23 28 / .08)` | `0 1px 0 rgb(0 0 0 / .4)` | rest shadow | – | – |
| `--shadow-2` | `0 1px 2px rgb(21 23 28/.10), 0 5px 13px rgb(21 23 28/.08)` | `0 1px 2px rgb(0 0 0/.5), 0 5px 13px rgb(0 0 0/.35)` | hover / raised | – | – |

**Seat hues** use the golden angle: `h = 200° + k·137.508°` in OKLCH. Light uses L .50 C .12 and dark uses L .80 C .10. They are a secondary identifier only: a 6px dot beside the name and the left border of a toast. They are always shown with the name.

| k | hue | Light | ratio bg/surf | Dark | ratio bg/surf |
|---|---|---|---|---|---|
| 0 | 200.0° | `#00767E` | 4.91 / 5.39 | `#64D1D7` | 10.6 / 9.8 |
| 1 | 337.5° | `#8D457B` | 5.84 / 6.42 | `#E8A5D5` | 9.8 / 9.0 |
| 2 | 115.0° | `#626A00` | 5.33 / 5.86 | `#BBC679` | 10.5 / 9.6 |
| 3 | 252.5° | `#2865A5` | 5.46 / 6.01 | `#8FC2FD` | 10.3 / 9.5 |

These are exposed as `--seat-0` … `--seat-3`. `k` is the playOrder index (not the self-relative index), so a player's hue is the same on every client.

**Deleted:** the `#4158d0 → #c850c0 → #ffcc70` body gradient, the 5 dead utilities (`button-dark`, `button-light`, `vote-bg*`), and the `'white'`, `'lightgray'`, `'while'` and `bg-gray-500/20` literals.

### 2.2 `globals.css` skeleton (exact)

```css
@layer theme, base, mantine, components, utilities;
@import "tailwindcss";

@custom-variant dark (&:where([data-mantine-color-scheme=dark], [data-mantine-color-scheme=dark] *));
@custom-variant compact (@media (orientation: landscape) and (max-height: 500px));
@custom-variant portrait-phone (@media (orientation: portrait) and (max-width: 600px));
@custom-variant wide (@media (min-width: 1280px) and (min-height: 720px));
@custom-variant fine (@media (pointer: fine));

@layer base {
  :root {
    --bg:#F6F4EE; --surface:#FFFFFF; --surface-raised:#FFFFFF;
    --ink:#15171C; --ink-muted:#585D69; --line:#DDD9CE; --composite:#C9C5B9;
    --border-strong:#878B95; --prime:#B3361B; --on-prime:#FFFFFF; --factor:#0E6E66;
    --mod:#4338CA; --gold:#8A5A00; --danger:#B42318; --card-face:#FFFFFF;
    --seat-0:#00767E; --seat-1:#8D457B; --seat-2:#626A00; --seat-3:#2865A5;
    --shadow-1: 0 1px 0 rgb(21 23 28 / .08);
    --shadow-2: 0 1px 2px rgb(21 23 28 / .10), 0 5px 13px rgb(21 23 28 / .08);
    /* type scale r = 1.25 */
    --fs--2:.64rem; --fs--1:.8rem; --fs-0:1rem; --fs-1:1.25rem; --fs-2:1.5625rem;
    --fs-3: clamp(1.5625rem, calc(1.5625rem + 1.2vmin), 1.953rem);
    --fs-4: clamp(1.953rem, calc(1.953rem + 1.2vmin), 2.441rem);
    --fs-5: clamp(2.441rem, calc(2.441rem + 1.2vmin), 3.052rem);
    --fs-6: clamp(3.052rem, calc(3.052rem + 1.2vmin), 3.815rem);
    /* Fibonacci × 4px */
    --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:20px; --sp-5:32px; --sp-6:52px; --sp-7:84px;
    --r-1:4px; --r-2:8px; --r-3:12px;
    /* Fibonacci ms */
    --t-xs:89ms; --t-sm:144ms; --t-md:233ms; --t-lg:377ms; --t-xl:610ms; --t-xxl:987ms;
    --ease-out: cubic-bezier(.22,1,.36,1); --ease-in-out: cubic-bezier(.65,0,.35,1); --ease-in: cubic-bezier(.55,0,1,.45);
    /* card sizes (GameCard fontSize = card height). --card-k set by size option */
    --card-k: 1;
    --card-hand:  calc(clamp(64px, 26dvh, 132px) * var(--card-k));
    --card-field: calc(clamp(56px, 22dvh, 120px) * var(--card-k));
    --card-tray:  calc(clamp(44px, 14dvh, 80px) * var(--card-k));
    --card-seat:  28px;
    --mantine-color-body: var(--bg);
  }
  [data-mantine-color-scheme='dark'] {
    --bg:#0D0F13; --surface:#161920; --surface-raised:#1F232C;
    --ink:#ECE9E2; --ink-muted:#A2A7B2; --line:#2A2F3A; --composite:#3A404D;
    --border-strong:#6E7483; --prime:#FF8A5C; --on-prime:#0D0F13; --factor:#2DD4BF;
    --mod:#A5B4FC; --gold:#F5C542; --danger:#F87171;
    --seat-0:#64D1D7; --seat-1:#E8A5D5; --seat-2:#BBC679; --seat-3:#8FC2FD;
    --shadow-1: 0 1px 0 rgb(0 0 0 / .4);
    --shadow-2: 0 1px 2px rgb(0 0 0 / .5), 0 5px 13px rgb(0 0 0 / .35);
  }
  [data-card-size='S'] { --card-k: .8; }
  [data-card-size='L'] { --card-k: 1.25; }
  html, body { background: var(--bg); color: var(--ink); }
  body { font-family: var(--font-sans), "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; line-height: 1.5; }
  .num { font-family: var(--font-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums slashed-zero; }
  :focus-visible { outline: 2px solid var(--mod); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    :root { --t-sm:.01ms; --t-md:.01ms; --t-lg:.01ms; --t-xl:.01ms; --t-xxl:.01ms; } /* --t-xs kept */
  }
}

@theme inline {
  --color-bg: var(--bg); --color-surface: var(--surface); --color-raised: var(--surface-raised);
  --color-ink: var(--ink); --color-ink-muted: var(--ink-muted); --color-line: var(--line);
  --color-composite: var(--composite); --color-border-strong: var(--border-strong);
  --color-prime: var(--prime); --color-on-prime: var(--on-prime); --color-factor: var(--factor);
  --color-mod: var(--mod); --color-gold: var(--gold); --color-danger: var(--danger);
  --font-sans: var(--font-sans); --font-mono: var(--font-mono);
  --spacing-fib-1: 4px; --spacing-fib-2: 8px; --spacing-fib-3: 12px; --spacing-fib-4: 20px;
  --spacing-fib-5: 32px; --spacing-fib-6: 52px; --spacing-fib-7: 84px;
}
```

`layout.tsx` imports `@mantine/core/styles.layer.css` and `@mantine/notifications/styles.layer.css`, not the unlayered files. The `@plugin "daisyui"` line and the `daisyui` devDependency are removed.

### 2.3 Mantine theme (`src/design/theme.ts`)

```ts
import { createTheme, type MantineColorsTuple } from '@mantine/core'

// generated around --prime light #B3361B (index 7 = light primary, index 4 = dark primary ≈ #FF8A5C)
export const prime: MantineColorsTuple = ['#FFF1EC','#FFDFD4','#FFBFA8','#FF9C78','#FF8A5C','#E8623A','#CC4826','#B3361B','#922A14','#72200E']
export const mod: MantineColorsTuple   = ['#EEF0FF','#DCE0FE','#C3CAFD','#A5B4FC','#8794F5','#6A73E6','#5551D6','#4338CA','#3730A3','#2B2680']
export const factor: MantineColorsTuple= ['#E6FBF7','#C7F5EC','#94EBDB','#5EE0CB','#2DD4BF','#14B3A0','#0F9083','#0E6E66','#0B5751','#08413D']
export const gold: MantineColorsTuple  = ['#FFF8E1','#FDEFC0','#FAE08A','#F7D263','#F5C542','#D9A521','#B07D0A','#8A5A00','#6E4800','#523500']
export const ink: MantineColorsTuple   = ['#ECE9E2','#D6D3CC','#B5B7BE','#A2A7B2','#878B95','#6E7483','#585D69','#3A3F49','#22252C','#15171C']

export const theme = createTheme({
  primaryColor: 'prime',
  primaryShade: { light: 7, dark: 4 },
  colors: { prime, mod, factor, gold, ink },
  black: '#15171C', white: '#FFFFFF',
  fontFamily: 'var(--font-sans), "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif',
  fontFamilyMonospace: 'var(--font-mono), ui-monospace, monospace',
  headings: { fontFamily: 'var(--font-sans), "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif', fontWeight: '700' },
  fontSizes: { xs: '0.8rem', sm: '0.875rem', md: '1rem', lg: '1.25rem', xl: '1.5625rem' },
  spacing:   { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1.25rem', xl: '2rem' },   // 4 8 12 20 32
  radius:    { xs: '0.25rem', sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '0.75rem' }, // r-1 r-1 r-2 r-3 r-3
  defaultRadius: 'md',
  breakpoints: { xs: '36em', sm: '48em', md: '62em', lg: '75em', xl: '88em' }, // unchanged (postcss-simple-vars)
  focusRing: 'never', // global :focus-visible in globals.css handles it
  cursorType: 'pointer',
  other: { motion: 'see src/design/motion.ts' },
  components: {
    Button: { defaultProps: { radius: 'md' }, styles: { root: { minHeight: 44 } } },
    ActionIcon: { defaultProps: { variant: 'subtle', size: 44 } },
    Modal: { defaultProps: { centered: true, radius: 'lg', overlayProps: { backgroundOpacity: 0.4, blur: 2 } } },
    Drawer: { defaultProps: { radius: 'lg' } },
    SegmentedControl: { defaultProps: { radius: 'md' } },
    Notification: { defaultProps: { radius: 'md', withBorder: true } },
    Tooltip: { defaultProps: { withArrow: true, openDelay: 233 } },
    Popover: { defaultProps: { radius: 'md', shadow: 'md' } },
  },
})
```

`layout.tsx` renders `<ColorSchemeScript defaultColorScheme="auto" />` and `<MantineProvider theme={theme} defaultColorScheme="auto">`. Storybook `preview.tsx` uses the same theme, with a light/dark toolbar global.

---

## 3. Typography and modular scale

- **Faces.** `src/design/fonts.ts`:
  ```ts
  import localFont from 'next/font/local'
  export const geistSans = localFont({ src: '../fonts/GeistVF.woff', variable: '--font-sans', weight: '100 900', display: 'swap' })
  export const geistMono = localFont({ src: '../fonts/GeistMonoVF.woff', variable: '--font-mono', weight: '100 900', display: 'swap' })
  ```
  Apply `className={`${geistSans.variable} ${geistMono.variable}`}` on `<html lang="ja">`. Japanese falls back to `"Hiragino Sans", "Noto Sans JP", system-ui`. No web-font downloads.
- **Numerals:** always `.num` (Geist Mono, `tabular-nums slashed-zero`), line-height 1.0, weight 700 for NumberGlyphs.
- **Scale:** ratio **r = 1.25** (major third), base 16px, `size(n) = 16·1.25ⁿ`.

| Step | Token | px | Use |
|---|---|---|---|
| −2 | `--fs--2` | 10.24 | superscript exponents, `G` tag (never standalone text) |
| −1 | `--fs--1` | 12.8 | captions, seat count, Kbd, value chips, log |
| 0 | `--fs-0` | 16 | body, buttons |
| 1 | `--fs-1` | 20 | section labels, toasts, seat names (desktop) |
| 2 | `--fs-2` | 25 | tray value (compact) |
| 3 | `--fs-3` | 25→31.25 fluid | field value (compact), tray value (desktop) |
| 4 | `--fs-4` | 31.25→39 fluid | field value (desktop), page titles |
| 5 | `--fs-5` | 39→48.8 fluid | home hero (compact), "57" caption |
| 6 | `--fs-6` | 48.8→61 fluid | home hero (desktop), Q.E.D. ∎ stamp |

- **Line height:** 1.5 for body, 1.236 for headings, 1.0 for numerals. **Weight:** 400 body, 600 labels, 700 numerals and headings.
- **`<Expr>` typesetting:** `FactCardId[]` → tokens.
  - Adjacent number cards join, mirroring `evalFactCardIds`.
  - `*` → ` · ` (U+22C5 with U+2009 thin spaces).
  - `^` → the next number group becomes `<sup>` at `--fs--2` in `--factor`.
  - `role="math"` and an `aria-label` that reads aloud in Japanese, e.g. `"2 の 3 乗 掛ける 3"`.
- **Language:** `<html lang="ja">`. Actions are Japanese:

| Old | New |
|---|---|
| draw | 引く |
| pass | パス |
| submit | 出す |
| (factorize) | 素因数分解 |
| ready / unready | 準備OK / 取消 |
| start game | ゲーム開始 |
| close | 閉じる |
| name | 名前 |
| OK | はじめる |
| clear | クリア |

  Mathematical labels stay as notation (`t`, `|H₀|`, `k_max`, `ℤ/nℤ`).

---

## 4. Spacing grid and layout system

- **Spacing:** Fibonacci × 4px: `--sp-1..7 = 4, 8, 12, 20, 32, 52, 84`. In Tailwind these are `p-fib-3` etc.; in Mantine, `xs..xl` maps to 4/8/12/20/32.
- **Radii:**
  - `--r-1` 4px: chips.
  - `--r-2` 8px: cards and inputs.
  - `--r-3` 12px: panels.
  - Seats, timer and pointer are true circles.
- **Touch targets:**
  - Every control is at least 44×44.
  - **Primary game actions (出す) are at least 55px tall on compact screens.**
  - Overlapping hand cards keep an exposed slice of at least 32px. Below that, the hand switches to a scroll-snap row.
- **Safe area:** the board shell uses `padding-inline: max(var(--sp-3), env(safe-area-inset-left), env(safe-area-inset-right))`.
- **Layout modes** come from one system, `useLayoutMode()` (`src/design/use-layout-mode.ts`, built on `window.matchMedia`). Tailwind custom variants mirror the same queries.
  - `compact`: `(orientation: landscape) and (max-height: 500px)`, a phone in play.
  - `portrait`: `(orientation: portrait) and (max-width: 600px)`, the playable fallback.
  - `wide`: `(min-width: 1280px) and (min-height: 720px)`, the ring table plus the proof-log sidebar.
  - `regular`: everything else (tablet or small desktop). It uses the compact layout with more room, and the log goes in a Drawer.

  Priority is compact > portrait > wide > regular. The SSR default is `'regular'`.

  This replaces the 800px rule in `PlayingCardLine` (now a container query or mode), the 1000px rule in calc, and ad-hoc Mantine/Tailwind breakpoints. `use-should-rotate.ts` (762px) is unchanged; it only drives the rotate banner.
- **Grid:** 8 columns on compact and 12 on regular/wide. Gutter is `--sp-3` on compact and `--sp-4` on regular/wide.
- **Card size:** `s ∈ {S: .8, M: 1, L: 1.25}`, a geometric series with r = 1.25, the same ratio as the type scale. It comes from the existing `cardSizeOption` key and is applied as `data-card-size` on the board root, which sets `--card-k`. The `sizeData` table in `game-board.tsx` is deleted.

---

## 5. Iconography

- Tabler icons at `stroke={1.5}`, size `1.25em`. Remove the empty `import {} from '@tabler/icons-react'` lines.
- Custom glyphs live in `src/design/icons.tsx`: inline SVG on a 24 grid, 1.5 stroke, round caps, `currentColor`, `aria-hidden` unless `title` is passed.
  - `IconTimes` (·), `IconPow` (xʸ), `IconTherefore` (∴), `IconQed` (∎), `IconNeq` (≠), `IconQEq` (≟), `IconEmpty` (∅)
  - `IconModRing` (circle with n ticks), `IconSieve` (3×3 grid with a struck-out cell), `IconSpiral`, `IconTree` (binary split), `IconLead` (▲)
- **Action mapping:**

| Action | Icon |
|---|---|
| 引く | `+1` over a card outline (`IconDrawCard`) |
| パス | `∅` |
| 出す | `↑` into a bracket (`IconSubmit`) |
| 素因数分解 | `IconTree` |
| リセット | `⟲` (`IconRotate2`) |
| ログ | `∴` |
| QR | Tabler `IconQrcode` |
| テーマ | `IconSunMoon` |

- **App icon** (`src/app/icon.svg`): a 7×7 Ulam spiral, with prime cells as squares in `#FF8A5C` and composites as dots `#3A404D`, on `#0D0F13` with a rounded rect r = 12%. In `manifest.json` add `"theme_color":"#0D0F13","background_color":"#0D0F13"` and keep the svg icon. PNG export is optional and out of scope.

---

## 6. Component inventory

Legend: **N** = new, **C** = changed (contract kept), **D** = deleted. "Owner" is the task ID in §11.

### 6.1 Shared design primitives (`src/design/`, owner: Foundation)

| File | Kind | Props / API |
|---|---|---|
| `tokens.ts` | N | `export const TOKENS: { light: Record<TokenName, string>; dark: … }`, `SEAT_HUES`, `contrast(a,b): number`, `TEXT_TOKENS`, `UI_TOKENS` |
| `theme.ts` | N | `theme`, palettes (see §2.3) |
| `fonts.ts` | N | `geistSans`, `geistMono` |
| `motion.ts` | N | `DUR`, `EASE`, `SPRING`, `stagger(count, base)`, `dampedShake(opts)`, `motionPreset(reduced)`, `variants.*` (see §9) |
| `motion-provider.tsx` | N | `<MotionProvider>{children}</MotionProvider>`: `LazyMotion features={domMax}` + `MotionConfig reducedMotion="user" transition={SPRING.snap}` |
| `use-layout-mode.ts` | N | `useLayoutMode(): 'compact'|'portrait'|'regular'|'wide'`, `LAYOUT_QUERIES` |
| `NumberGlyph.tsx` | N | `{ value: number | string | null; size?: -1|0|1|2|3|4|5|6; tone?: 'ink'|'muted'|'prime'|'gold'|'danger'|'factor'; placeholder?: string /* default '—' */; srLabel?: string; className? }`. Rolls each changed digit, `y: ±100%→0`, direction from the sign of the change. `null` renders the placeholder. `aria-live` is off by default. |
| `Expr.tsx` | N | `{ tokens: FactCardId[]; highlightIndex?: number /* offending factor */; className? }` |
| `icons.tsx` | N | glyphs listed in §5 |
| `SieveGrid.tsx` | N | `{ n?: number /* default 100 */; cols?: number /* 10 */; animate?: boolean; passes?: number[] /* [2,3,5,7] */; size?: number; 'aria-hidden'?: boolean }`. Memoised SVG. Primes are filled squares in `--prime` at 25% (home) or 100% (loading); composites are hollow dots in `--composite`. With `animate`, strike-out passes run. |
| `UlamField.tsx` | N | `{ side: number /* odd */; cell?: number; primeColor?: string; dotColor?: string; reveal?: boolean }`. Memoised SVG. |
| `ModRing.tsx` | N | `{ n: number; filled?: number /* ticks filled, loader */; size?: number; spin?: boolean; label?: string }` |
| `FactorTree.tsx` | N | `{ value: number | bigint; factors: (number|bigint)[] | null; animate?: boolean }`. `null` renders `合成数（因数分解は省略）`. |
| `math/sieve.ts` | N | `sieve(n): boolean[]`, `primesUpTo(n): number[]` |
| `math/ulam.ts` | N | `ulamCoord(k): {x,y}` (1 at the origin, counter-clockwise), `ulamCells(side)` |
| `math/factorize.ts` | N | `factorize(n: number|bigint, budgetMs = 5): (number|bigint)[] | null`. Uses `primes-and-factors` while ≤ MAX_SAFE_INTEGER, BigInt trial division above that, `null` when the budget or the 1e15 cap is exceeded. `parseConcat(str): number|bigint` |
| `math/geometry.ts` | N | `seatAngle(k, n)` (self = π/2, clockwise), `ellipsePoint(a,b,θ)`, `ringPoint(r,θ,n?)`, `fanLayout({n, W, cardW, maxDeg?})` → `{mode:'fan'|'scroll', step, items:[{x,y,rotate}]}`, `timerDash(left,total,C)`, `bezierArc(from,to,lift,steps=8)` → `{x[],y[]}`, `logSpiral({from,to,turns})` → `{x[],y[]}`, `phyllotaxis(age,c)` → `{x,y,scale,opacity}` |
| `test-utils.tsx` (`src/test-utils.tsx`) | N | `renderWithProviders(ui, { colorScheme?, reducedMotion? })`, `mockMatchMedia(map)`, `makeGameState(partial)`, `makeCtx(partial)`, `makePresence(list)`, `serverMsg.*` (JSON payload builders for every server→client message) |

### 6.2 Cards and player area (owner: T1 `cards`)

| File | Kind | Props |
|---|---|---|
| `src/game-card/src/components/game-card.tsx` | C | Same contract. Adds an `aria-label` default from `cardLabel(card)` (e.g. `"スペードの3, 3"`, `"ハートのJ, 11"`, back = `"山札"`) unless the caller passes one, and `data-card={card}`. |
| `src/game-card/src/tools/card-label.ts` | N | `cardLabel(card: CardId|'Back'): string`, `cardValue(card): number` (A=1 … K=13) |
| `src/game-card/src/components/icons/Back.tsx` | C | A new Ulam-spiral back (§8.2), same export name and viewBox ratio. |
| `src/game-card/src/components/math-card.tsx` (exported from `@/game-card/src`) | N | `MathCard: FC<{ card: CardId|'Back'; size: 'hand'|'field'|'tray'|'seat'|string /* css length */; state?: 'rest'|'selected'|'disabled'|'confirmed'|'error'|'fresh'; showValue?: boolean; layoutId?: string; role?: string; tabIndex?: number; 'aria-selected'?: boolean; onActivate?: () => void; motionProps?: MotionProps }>`. Renders `motion.div` > `GameCard` (`fontSize = var(--card-*)`, inner role `presentation`). Hover lift only for `pointer: fine`. |
| `src/components/playing-card-line.tsx` | C | Same props; the prop leak is fixed (destructure `cardIds, onClickCard, focusable, gameCardProps, size`). Renders `MathCard`. The 10/20-column rule comes from `useLayoutMode` (compact/portrait → 10). |
| `src/app/room/[id]/_ui/board/Hand.tsx` | N | `{ cardIds: CardId[]; isMyTurn: boolean; mode: 'basic'|'factor'; freshIds?: CardId[]; showValues?: boolean; onSelect(card: CardId): void; layout?: 'auto'|'fan'|'scroll'|'wrap' }`. A `role="listbox"` with `aria-label="手札"`, `aria-orientation="horizontal"`, roving tabindex, ←/→/Home/End, and Enter/Space → `onSelect`. |
| `src/app/room/[id]/_ui/board/SubmitTray.tsx` | N | `{ cardIds: CardId[]; fieldTop: CardId[] | null; onRemove(card): void; onReset(): void; shakeKey?: number; errorMessage?: string | null }`. Shows the value, `≟`, the checks `枚数 k ✓/✗` and `> 場 ✓/✗` (pure arithmetic), and gold + `G` at 57. A listbox with `aria-label="提出"`. |
| `src/app/room/[id]/_ui/board/FactorPanel.tsx` | N | `{ open: boolean; target: number; factCards: FactCardId[]; onAddOperator(op: '*'|'^'): void; onRemove(index: number): void; onClose(): void }`. Uses `Expr`, `isValidFactCardIds`, `evalFactCardIds` (read-only imports); shows `= value` and `=`/`≠` target only when valid. |
| `src/app/room/[id]/_ui/board/card-tray-utils.ts` | N | `trayChecks(cards, fieldTop)` → `{ value, countOk, greaterOk, isGrothendieck }` (pure, built on `concatCardNumbers`) |

### 6.3 Table and results (owner: T2 `table`)

| File | Kind | Props |
|---|---|---|
| `board/Seat.tsx` | N | `{ name: string; handCount: number | null; hueIndex: number; isSelf?: boolean; isActive?: boolean; isLead?: boolean; passed?: boolean; observer?: boolean; leftTime?: number; timeLimit?: number; penalty?: number /* +n chip */; variant?: 'default'; layout: 'chip'|'node' }`. **Never renders opponent card faces**, only a mini ▣ and the count. |
| `board/SeatLine.tsx` | N | `{ seats: SeatModel[]; n: number }`. Compact top bar: the residue line `ℤ/nℤ ①→②→③ ↺`, with the `--mod` pointer as a shared `layoutId="turn-pointer"`. |
| `board/SeatRing.tsx` | N | `{ seats: SeatModel[]; width: number; height: number; children?: ReactNode /* table centre */ }`. Wide layout: ellipse a = .42W, b = .34H, seats at `seatAngle`, a turn radius line (spring-rotated) and a `--mod` arc toward the next seat. |
| `board/TurnTimer.tsx` | N | `{ leftTime: number | null; timeLimit: number; size?: number /* 28 */ }`. A `role="timer"` ring with `aria-valuenow`/`aria-valuemax`. Negative values clamp to 0. `data-urgency="none"|"warn"|"danger"`: warn ≤ 10 s in `--danger` colour, danger ≤ 5 s pulsing. |
| `board/FieldStack.tsx` | N | `{ field: CardId[][]; leadName?: string | null; compactHistory?: number /* 3 */; variant?: 'default'; resultOverlay?: ReactNode }`. Shows the top cards, `= NumberGlyph`, the constraint readout `k = 2 枚 · > 1013` or `k = 自由`. |
| `board/FieldSequence.tsx` | N | `{ values: number[]; struck?: boolean; layout: 'line'|'phyllotaxis' }`. `13 < 47 < 1013`, with older values collapsing to `… <`. Wide mode may use phyllotaxis. |
| `board/DeckPile.tsx` | N | `{ count: number; canDraw: boolean; disabledReason?: 'drawn'|'empty'|'not-your-turn' | null; onDraw?: () => void; compact?: boolean }`. A ▣ stack (up to 3 offset backs) plus a NumberGlyph count. The deck element carries `data-anchor="deck"` for flight origins. |
| `board/ResultOverlay.tsx` | N | `{ result: SubmitResultView | null; onDone?(): void }`, where `SubmitResultView = { kind: 'ok'|'BASE_IS_NOT_PRIME'|'FACT_CONTAIN_NOT_PRIME'|'INCORRECT_ANSWER'; value: number; factor?: FactCardId[]; evaluated?: number; offendingIndex?: number; penalty: number; submitter: string }`. Covers the factor tree, `∉ℙ` box, `=`→`≠` morph and `+n` chip. |
| `board/GrothendieckCut.tsx` | N | `{ active: boolean; onDone(): void; skippable?: boolean }`. A gold slash, the caption `57 — グロタンディーク素数切り`, and `もう一度`. |
| `board/GameSetDialog.tsx` | N | `{ opened: boolean; winner: string | null; standings: { name: string; handCount: number }[]; plays?: number; onNextRound(): void; canStart?: boolean }`. "Theorem. {winner} の勝ち。 Proof. \|H_{winner}\| = 0. ∎" with the Q.E.D. stamp. |
| `board/seat-model.ts` | N | `buildSeats({ gameState, ctx, presence, selfId, passedIds, leftTime })` → `SeatModel[]`, rotated so self = k0 and observers flagged. `deriveObservers`, `deriveLeadId`. Pure. |

### 6.4 Board container, director, room chrome (owner: T3 `board`)

| File | Kind | Props |
|---|---|---|
| `src/app/room/[id]/_ui/game-board.tsx` | C | Same export and props. A thin container: socket, state, `useMessageHandler`, `useMyField`, `validateSubmitCardSet` (unchanged text), auto-pass, notifications, director wiring, composition via `BoardLayout`. Keyboard shortcuts. |
| `board/BoardLayout.tsx` | N | `{ mode: LayoutMode; top: ReactNode; deck: ReactNode; field: ReactNode; tray: ReactNode; actions: ReactNode; hand: ReactNode; log?: ReactNode; factorOpen?: boolean }`. CSS grid areas per mode (§7.5–7.7). |
| `board/ActionBar.tsx` | N | `{ canDraw; drawReason; canPass; canSubmit; factorMode: boolean; factorDisabled: boolean; isMyTurn: boolean; onDraw; onPass; onSubmit; onToggleFactor; orientation: 'rail'|'row'|'bottom'; showKbd?: boolean }` |
| `board/ConnectionOverlay.tsx` | N | `{ state: 'connecting'|'open'|'closed'|'error'|'waiting-sync'; onReconnect?(): void; children }`. Desaturates the board with a ModRing loader overlay. |
| `board/ProofLog.tsx` | N | `{ entries: LogEntry[]; variant: 'sidebar'|'drawer'; opened?: boolean; onClose?(): void }`, where `LogEntry = { id: string; node: ReactNode; kind?: 'system'|'play'|'fail'|'pass'|'end' }`. Numbered entries, `aria-live="polite"`. |
| `board/LiveRegion.tsx` | N | `{ message: string | null }`. `role="status"` sr-only: "あなたの番です", results, penalties, winner, "残り5秒". |
| `board/use-board-director.ts` | N | `useBoardDirector({ reduced })` → `{ current: BoardEvent | null; push(e: BoardEvent): void; holdEnd(e): void; done(): void; queueLength }` (§9.3) |
| `board/classify-transition.ts` | N | `classifyTransition(prev: GameState | null, next: GameState, msg: SystemMessage, selfId: string): BoardEvent[]`. Pure. |
| `board/rule-diff.ts` | N | `ruleDiff(prev, next): string[]` → `['t: 60 → 15 s']` |
| `board/index.ts` | N (Foundation creates) | barrel |
| `board/types.ts` | N (Foundation creates) | `SeatModel`, `BoardEvent`, `SubmitResultView`, `LogEntry`, `LayoutMode` |
| `src/app/room/[id]/page.tsx` | C | `window.location.href` moved into `useEffect` state. RoomHeader with the room id, QR, S/M/L and log toggle. Board root gets `data-card-size`. The log becomes a `ProofLog`. |
| `src/app/room/[id]/layout.tsx` | C | Full-bleed `min-h-dvh bg-bg` shell (no Mantine Container). Remove the empty import. |
| `src/app/room/[id]/_ui/RoomHeader.tsx` | N | `{ roomId; url: string | null; size: 'S'|'M'|'L'; onSizeChange; onOpenLog?; n?: number; collapsed?: boolean }`. Holds `HeaderActions`, the NavBurger slot. |
| `src/app/room/[id]/_ui/QRButton.tsx` | C | Same props, restyled. `defaultOpened` from props is honoured. **Decision:** `page.tsx` passes `defaultOpened: mode !== 'compact'` (flagged behaviour change on phones, approved by the design lead; the button pulses once instead). |
| `src/app/room/[id]/_ui/notification-message.tsx` | C | Same names and props, restyled with `Expr` and `NumberGlyph`; fixes `<p>` inside `<p>`. |

### 6.5 Lobby screens and global chrome (owner: T4 `screens`)

| File | Kind | Notes |
|---|---|---|
| `src/app/page.tsx` | C | The home page per §7.1. Disabled buttons are not wrapped in `Link`. Counters are `NumberGlyph` with `null` until the first lobby message. |
| `src/app/_ui/home-hero.tsx` | N | `{ reduced?: boolean }`. The SieveGrid strip, title and Ulam field. |
| `src/app/login/page.tsx`, `login/layout.tsx` | C | §7.2. Callback logic is unchanged verbatim. |
| `src/app/login/name-length-meter.tsx` | N | `{ length: number; min?: 3; max?: 10 }`. 10 ticks; `role="meter"`. |
| `src/app/room/new/loading.tsx`, `room/new/error.tsx` | N | §7.3. `page.tsx` is untouched. |
| `src/app/room/[id]/_ui/waiting-room.tsx` | C | Same props. Seats on a ModRing, rules as axioms, a ready progress bar. |
| `src/app/_ui/nav-burger.tsx` | C | Same export. Adds a `placement?: 'affix'|'inline'` prop (default `'affix'`) and fixes the inverted fullscreen icon. Affix offset is `--sp-3`, with z-index below modals. Adds a theme toggle item. |

### 6.6 Labo, gallery, visual smoke (owner: T5 `labo`)

| File | Kind | Notes |
|---|---|---|
| `src/app/labo/calc/page.tsx` | C | §7.8. Hotkeys are unchanged. An empty selection shows `n = —`. |
| `src/app/labo/layout.tsx` | C | Token styling; back link. |
| `src/app/labo/gallery/page.tsx` + `gallery/fixtures.ts` | N | The **design gallery**: renders every board piece and full-board compositions from mock state with no socket (§10.5). `?scene=` query selects a scenario. Not linked from home. |
| `scripts/screens.mjs` | N | A Playwright screenshot smoke test against `next dev` `/labo/gallery` (no PartyKit). |
| Stories | N | `src/design/*.stories.tsx` for the shared primitives. |

### 6.7 Deleted

- The `sizeData` table and the inline Popover factor UI in `game-board.tsx`.
- The daisyUI dialog markup and the daisyUI plugin/devDependency.
- The dead CSS utilities.
- The empty `@tabler/icons-react` imports.
- The `/labo/training` and `/room/random` hrefs on disabled buttons.

---

## 7. Screen layouts

Wireframe notation: `▢` card face, `▣` card back, `◉` active seat, `○` idle seat, `·` composite dot, `■` prime cell.

### 7.1 Home `/`

```
DESKTOP 1440×900
┌──────────────────────────────────────────────────────────────────────────┐
│ · · ■ · ■ · · · ■ · ■ · · · ■ · ■ · · · ■   (UlamField, aria-hidden)  ☰ │
│          ┌────────────────────────────────────────────┐                  │
│          │ 2  3  ·  5  ·  7  ·  ·  · 11  · 13  ·  ·   │ ← SieveGrid strip (1..100, 2 rows × 50)
│          │ 素 数 大 富 豪           (--fs-6, 700)       │
│          │ Prime Daifugō  ·  ∀p∈ℙ, p > 場  (--fs-1 muted)│
│          ├──────────┬──────────┬──────────────────────┤
│          │  42      │  17      │  6                   │ ← NumberGlyph (--fs-4), "—" until first msg
│          │ オンライン│ ロビー    │ 部屋                  │
│          ├──────────┴──────────┴──────────────────────┤
│          │ [ ルーム作成  → ]   (prime fill, 55px)        │
│          │ [ ランダムマッチ · 準備中 ] (disabled button)   │
│          │ [ ゲームルール ↗ ]  [ 素数判定ラボ ∴ ]          │
│          └────────────────────────────────────────────┘                  │
│                    フィードバック ↗ · 更新履歴 ↗ · X ↗ · トレーニング(準備中)  │
└──────────────────────────────────────────────────────────────────────────┘

MOBILE LANDSCAPE 844×390 (two columns, golden split 0.618 : 0.382)
┌────────────────────────────────────────────┬─────────────────────────────┐
│ 2 3 · 5 · 7 · · · 11 · 13 …  (1 row × 30)  │ [ ルーム作成 → ]   55px       │
│ 素数大富豪  (--fs-5)                        │ [ ランダムマッチ · 準備中 ]   │
│ ∀p∈ℙ, p > 場                               │ [ ルール ↗ ] [ ラボ ∴ ]       │
│ 42 オンライン · 17 ロビー · 6 部屋           │ フィードバック · 更新履歴 · X │
└────────────────────────────────────────────┴─────────────────────────────┘
PORTRAIT: single column, the same order.
```

- The panel is `--surface` with `--r-3` and `--shadow-2`, max width 610px (Fibonacci). The page is `--bg` with the Ulam field at 40% opacity.
- External URLs are unchanged. The calculator link goes to `/labo/calc`.

### 7.2 Login `/login`

```
┌───────────────── centred card (max 377px) ─────────────────┐
│  ∎ 素数大富豪                                   (--fs-2)    │
│  名前を入力してください                                       │
│  名前 [ alice_______________ ✕ ]                             │ ← CloseButton clears (replaces fake 🗑️)
│  ▮▮▮▮▮▯▯▯▯▯  5 / 10   3〜10 文字                              │ ← NameLengthMeter: ticks 1–2 hollow-dashed,
│  [            はじめる  →            ] (prime, disabled if invalid) │   filled ticks --mod, out of range → --danger + ✗
└──────────────────────────────────────────────────────────────┘
```

Keep the cookie (`name`, 365 days) and `location.pathname = callback ?? '/'` exactly. Enter submits.

### 7.3 `/room/new`

- `loading.tsx`: a centred `SieveGrid n=100 cols=10 animate passes=[2,3,5,7]`, caption `部屋を探しています…`. Under reduced motion it is static, with the primes filled.
- `error.tsx` (client): `部屋を作れませんでした ∴` with a `[もう一度]` link to `/room/new` and a `[ホームへ]` link.
- `page.tsx` is **not modified**.
- `export const dynamic = 'force-dynamic'` is NOT added; it stays flagged for the team.

### 7.4 Waiting room (`roomStatus === 'waiting'`)

```
COMPACT 844×390
┌──────────────────────────────────────────────────────────────────────────┐
│ ℤ/4ℤ  Room 1234  [QR] [S|M|L]                          ∴ ログ   ☰        │ 36px RoomHeader
├────────────────────────────────┬─────────────────────────────────────────┤
│        ModRing (seats)         │  公理 (ルール)                           │
│             ⓪                  │  制限時間  t ∈ { 15 | 60 | 300 } s       │
│          ● alice ✓ あなた       │  初期手札 |H₀| ∈ { 4 | 8 | 11 }          │
│   ③ ◌ ─────────── ● ① bob ✓    │  最大提出 k_max ∈ { 4 | ∞ }             │
│   (空席)                        │  偶数半減  2∤n (♥♦)  { OFF | ON }        │
│          ○ ② carol             │                                          │
│  [ 準備OK ✓ ]  [ ゲーム開始 → ]  │  準備 2/4 ▮▮▯▯  (2人以上で開始)          │
└────────────────────────────────┴─────────────────────────────────────────┘
DESKTOP: same panes (ring 360px : rules), max width 987px, centred. PORTRAIT: ring on top, rules below.
```

- **Seats** sit at `θₖ = −π/2 + 2πk / max(n, 4)` (top = ⓪ = first presence) with R = min(paneW, paneH)·0.36.
  - Ready is a filled ●; not ready is a hollow ○; an empty residue is a dashed ◌ labelled `(空席)`.
  - Self gets a `--mod` halo and `あなた`. The seat-hue dot sits by the name.
- The rule controls are Mantine `SegmentedControl`s with identical values: `15/60/300`, `4/8/11`, `4/52` (label `∞`), `halfEvenNumbers` off/on. The `grid-cols-12` hack is dropped.
- `ゲーム開始` is enabled via `ClientRoomManager.canStartGame(presence)`. While disabled, the ready-tick bar explains why.
- The log shows a rule diff (`rule-diff.ts`) instead of `JSON.stringify` (the board container formats it).

### 7.5 Game board, compact landscape (the primary target; 844×390, 44px safe area each side → 756 usable)

```
 x=44                                                                       x=800
┌────────────────────────────────────────────────────────────────────────────┐ y=0
│ ℤ/3ℤ ① ◉alice(あなた) 7 → ② ○bob 9 ▲ → ③ ○carol 3 ∅ ↺ │ ◔42 │ ∴ │ ⋯ │ ☰ │ 36  SeatLine + TurnTimer
├──────┬───────────────────────────────────────────────┬───────────────────┤
│ ▣▣   │ 13 < 47 <  [▢][▢]  = 1013                     │ [引く +1] [パス ∅] │ 132 FIELD     │ RAIL
│ 23   │            k = 2 枚 · > 1013                  │ [ 素因数分解 🌳 ]  │               │ 168px
│[引く]│   (ResultOverlay / GrothendieckCut overlays)   │                   │               │ (44,44,
├──────┼───────────────────────────────────────────────┤                   ├───            │  55px)
│  ⟲   │ [▢][▢]  = 1103 ≟     枚数 2 ✓   > 場 ✓        │ [    出す ↑     ] │  76 TRAY      │
├──────┴───────────────────────────────────────────────┴───────────────────┤
│ ▢  ▢  ▢  ▢  ▢  ▢  ▢  ▢  ▢  ▢  ▢   (arc fan; scroll-snap if slice < 32px)   │ 128 HAND
│ ₁  ₃  ₄  ₇  ₉ ₁₀ ₁₁ ₁₂ ₁₃ …  (value chips, toggle in ⋯ menu)              │
└────────────────────────────────────────────────────────────────────────────┘ y=390
```

- **Vertical budget:** 36 + 4 + 132 + 4 + 76 + 4 + 128 = **384 ≤ 390**. On a 360px-tall Android the `dvh` clamps shrink the cards: hand 94px, field 79px.
- **Grid areas (compact):**
  ```css
  grid-template-columns: 72px 1fr 168px;
  grid-template-rows: 36px 132px 76px 128px;
  grid-template-areas: "top top top" "deck field rail" "reset tray rail" "hand hand hand";
  ```
  The deck column is 72px. The rail spans the field and tray rows and stacks `[引く][パス]` (44px, two columns), `[素因数分解]` (44px) and `[出す]` (**55px**, prime fill, bottom, within thumb reach).
- **Factor mode:** the row template becomes `36px 76px 132px 128px`. The field shrinks to its value and mini cards; the tray grows into the FactorPanel. This is a layout animation, not a popover:
  ```
  │ ⟲ │ [▢▢] 1102 =  2 · 19 · 29 ▢…   = 1102 = ✓    [·] [xʸ] [戻る]  │ 出す ↑ │
  ```
- **SeatLine:**
  - Seats appear in `ctx.playOrder` order, rotated so self is first, observers excluded. `↺` marks the wrap.
  - Each seat shows the name, a mini ▣ with the count, the hue dot, `▲` (lead = `deckTopPlayer`), and `∅` (passed this rotation, derived on the client, cleared on flow or when the seat plays).
  - The active seat is ◉ with a `--mod` underline and the shared pointer.
  - Observers get a `観戦` tag on a trailing chip group. If `currentPlayer` is not in `players`, no seat is lit.
- **TurnTimer:** a 28px ring, `strokeDashoffset = C·(1 − clamp(left, 0, T)/T)`, with the digits in the centre.
- **Hand:** `fanLayout`.
  - Card width `w = 0.6886·h`; `step = clamp(0.38w, (W − w)/(n − 1), w + 8)`.
  - Arc: `θᵢ = (i − (n−1)/2)·δ`, `δ = min(2.5°, 20°/n)`, `yᵢ = R(1 − cos θᵢ)` with `R = 4W`.
  - If `step < max(32px, 0.38w)`, the hand switches to a `scroll-snap-type: x mandatory` row with edge fades.
  - **On my turn:** a `--mod` 2px top rule, the panel lifts 4px, and a one-off glow.
  - **Off turn:** `filter: saturate(.618)`, **opacity stays 1**. The hand stays interactive, because selection is allowed off turn today.
- **RoomHeader** collapses during `playing` on compact screens. Its content moves into the `⋯` popover (room id, QR, S/M/L, value chips toggle, theme), so the 36px bar is the SeatLine.

### 7.6 Game board, desktop `wide` (1440×900)

```
┌─────────────────────────────────────────────────────────────────────┬───────────────────┐
│ ℤ/4ℤ · Room 1234 [QR]   S M L   ◐                                ☰  │ 証明ログ  ∴        │ 52px header
├─────────────────────────────────────────────────────────────────────┤ (12) carol  ∅ パス │
│                          ○ ② bob 9 ▲                                 │ (11) bob 1013 ✓   │
│                     ╱  · · ■ · ■ · · ■ · ■ ·  ╲     ▣▣ 23            │      ∵ 素数       │
│      ○ ① carol 3 ∅ (    13 < 47 < 1013        ) ○ ③ dave 6  [引く +1] │ (10) alice 221 ✗  │
│                     │   [▢][▢]   = 1013        │                     │      = 13 · 17    │
│                     │   k = 2 枚 · > 1013     │   (turn radius from  │      +2 枚        │
│                     ╲  · ■ · · ■ · · · ■ ·    ╱    centre to ◉)      │  (9) …             │
│                          ◉ ⓪ alice (あなた) ◔ 42                      │                   │
├─────────────────────────────────────────────────────────────────────┤ 320px, newest top │
│  ⟲ [▢][▢] = 1103 ≟  枚数 ✓  > 場 ✓      [素因数分解 🌳]  [パス ∅]  [出す ↑] │                   │
│  ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢   (arc fan, hover lift)                       │                   │
└─────────────────────────────────────────────────────────────────────┴───────────────────┘
```

- **Grid:**
  ```css
  grid-template-columns: 1fr 320px;
  grid-template-rows: 52px 1fr auto auto;
  grid-template-areas: "top log" "table log" "tray log" "hand log";
  ```
- **SeatRing:**
  - Ellipse with `a = .42W`, `b = .34H`.
  - Self sits at θ = π/2 (bottom); play goes clockwise, `θₖ = π/2 + 2πk/n`.
  - The inner background is a faint SieveGrid (`--composite` dots, prime cells at 25% alpha), which shimmers once on a prime play.
  - The turn radius is a line from the centre to the active seat, spring-rotated along the shortest signed arc.
  - The field history uses `FieldSequence layout="line"` by default. Phyllotaxis is an allowed variant for history of 4 or more items, but it never shrinks a value below `--fs--1`.
- **`regular` (tablet / small desktop):** the compact grid with larger clamps; the log is a right `Drawer`.
- **`portrait`:** rows go SeatLine (36) / field / tray / hand (wraps to 2 rows) / `ActionBar orientation="bottom"` (4 buttons, 55px). The rotate banner is a dismissible Mantine `Notification`-style card at the top that honours `shouldShowRotateRecommender`.

### 7.7 Overlays and states

- **Connecting:** a centred `ModRing n=12 spin` with `接続中…`.
- **Connected but no state yet (sync bug):** `次のイベントを待っています…` over the empty table.
- **Failure:** `Alert color="red" role="alert"` reading `接続が切れました` with `[再接続]`.
- **GAME SET (`waitingNextRound`)**: a `GameSetDialog` Modal (width 610), `--surface-raised`.
  ```
  ┌──────────────────────────────────────────┐
  │  Theorem.  bob の勝ち。                   │
  │  Proof.    |H_bob| = 0.                    │
  │            ─────────────                   │
  │  alice 3 · carol 5 · dave 1   (mini table) │
  │                               Q.E.D. ∎    │ ← stamp, --gold, --fs-6
  │  [ 次のラウンドを開始 → ]  (prime fill)     │
  └──────────────────────────────────────────┘
  ```
  The CTA calls `handleGameStart(gameState.rule)` exactly as today.

### 7.8 `/labo/calc`

```
┌─ ← 素数判定ラボ ───────────────────────────────────────────────┐
│  ┌──────────── readout ────────────┐  ┌──── keypad (♣) ────┐ │
│  │ n = 1 0 1 3          (--fs-5)   │  │  A   2   3          │ │
│  │ n ∈ ℙ  ■ 素数                    │  │  4   5   6   [Kbd]  │ │
│  │   or  n = 3 · 337  ✗ 合成数       │  │  7   8   9          │ │
│  │ [▢][▢][▢]  ⌫  クリア             │  │  10  J   Q   K      │ │
│  └──────────────────────────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- The split is golden (readout 0.618, keypad 0.382) and stacks in portrait.
- Hotkeys stay: 1–9, 0 = 10, j/q/k, Esc, Backspace. The `MAX_SAFE_INTEGER` alert stays. An empty selection shows `n = —` with no verdict.
- This page is a primality tool, so showing prime status here is intended.

---

## 8. Card design

### 8.1 Faces: keep the 52 SVGR faces, restyle via the `MathCard` wrapper

The `GameCard` contract is unchanged. `MathCard` adds the frame and the states:

| State | Visual | Signal besides colour |
|---|---|---|
| rest | `--card-face`, 1px `--border-strong` hairline, `--r-2` clip, `--shadow-1` | – |
| hover (`pointer:fine`) | `y: −h/φ⁴ ≈ −0.146h` (max 8px), `--shadow-2` | lift |
| focus-visible | 2px `--mod` ring, 2px offset | ring |
| selected (in tray) | moves via `layoutId`; tray copy gets an `--ink` 2px outline and a rank badge `J = 11` (mono `--fs--1`) | position + badge |
| disabled / off-turn | `filter: saturate(.618)`, opacity 1, `aria-disabled` | dim saturation + `aria-disabled` |
| confirmed (field top after success) | 2px `--prime` underline bar under the stack | bar |
| error | `--danger` outline for 610 ms | shake |
| fresh (drawn / penalty) | `--gold` 2px underline tick for 2584 ms (Fibonacci) | underline |
| value chip (optional) | mono `--fs--1` subscript under each hand card (A=1…K=13); toggled in the `⋯` menu, localStorage `showCardValues` (new per-viewer key) | text |

- Dark mode: cards stay white with a `rgba(236,233,226,.25)` hairline.
- **`layoutId`:** `card-${id}`. The 52 ids are unique, so a single physical card animates between hand, tray, fact tray and field inside one `LayoutGroup id="board"`.

### 8.2 Back: a new Ulam-spiral design (replaces `icons/Back.tsx`, same export)

- Keep the existing viewBox (201.58×282.22) so the `0.69em × 1em` sizing holds.
- Ground `#15171C`, with a double-rule frame (outer 1.5px, inner 0.75px, `#ECE9E2`, inset 8 and 12).
- Inside: a 21×21 Ulam spiral (k = 1…441), centred and fitted to the inner frame width. Primes are filled squares (`#ECE9E2`, cell .62); composites are 1px dots (`#ECE9E2` at 25%). The centre "1" is a small `--prime` `#FF8A5C` diamond as the only accent.
- It is generated at module load by `ulamCells(21)` and memoised, so there is no huge static file. It keeps the black-and-white identity of the old back.

---

## 9. Animation catalogue

### 9.1 Motion tokens (`src/design/motion.ts`)

```ts
export const DUR = { xs: .089, sm: .144, md: .233, lg: .377, xl: .610, xxl: .987, xxxl: 1.597 } as const // Fibonacci ms → s
export const EASE = {
  out:   [0.22, 1, 0.36, 1],     // entrances
  inOut: [0.65, 0, 0.35, 1],     // travel
  in:    [0.55, 0, 1, 0.45],     // exits
} as const
export const SPRING = {
  snap:   { type: 'spring', visualDuration: 0.233, bounce: 0 },     // UI, pointers
  card:   { type: 'spring', visualDuration: 0.377, bounce: 0.15 },  // card layout moves
  soft:   { type: 'spring', visualDuration: 0.377, bounce: 0 },     // panels, layout bands
  bounce: { type: 'spring', visualDuration: 0.610, bounce: 0.382 }, // 57, win stamp (1/φ²)
} as const
export const stagger = (count: number, base = 0.055, cap = 1.2) => Math.min(base, cap / Math.max(1, count))
// damped sine shake: x(t) = A·e^(−λt)·sin(ωt), sampled at n points over duration
export function dampedShake({ A = 8, lambda = 6, omega = 20 * Math.PI, duration = 0.377, n = 13 } = {}): number[]
// returns keyframes, first and last exactly 0
export function motionPreset(reduced: boolean): MotionPreset // maps every named variant to its reduced fallback
```

Shared variants (`variants.*`):

```ts
fadeUp:   { hidden: { opacity: 0, y: 8 },  show: { opacity: 1, y: 0, transition: { duration: DUR.md, ease: EASE.out } } }
pop:      { hidden: { opacity: 0, scale: .6 }, show: { opacity: 1, scale: 1, transition: SPRING.bounce } }
seat:     { hidden: { opacity: 0, scale: .6 }, show: { opacity: 1, scale: 1, transition: SPRING.soft }, exit: { opacity: 0, scale: .6, transition: { duration: DUR.md, ease: EASE.in } } }
drawLine: { hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { duration: DUR.md, ease: EASE.out } } }
digit:    (dir: 1|-1) => ({ initial: { y: `${dir * 100}%` }, animate: { y: '0%' }, exit: { y: `${-dir * 100}%` }, transition: { duration: DUR.md, ease: EASE.out } })
shake:    { x: dampedShake(), transition: { duration: DUR.lg, ease: 'linear' } }
dissolve: { exit: { opacity: 0, scale: .8, filter: 'blur(4px)', transition: { duration: DUR.lg, ease: EASE.in } } }
stamp:    { hidden: { opacity: 0, scale: 1.4, rotate: -6 }, show: { opacity: 1, scale: 1, rotate: 0, transition: SPRING.bounce } }
reduced:  { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: DUR.sm } } }
```

Global setup:
- `MotionProvider` (`LazyMotion features={domMax} strict` + `MotionConfig reducedMotion="user" transition={SPRING.snap}`) wraps the app body in `layout.tsx`. Components use `m.*`, not `motion.*`.
- Only `transform`, `opacity`, `filter` (fact dissolve only) and SVG `pathLength`/`strokeDashoffset` are animated.
- `will-change: transform` goes only on cards in flight. At most 24 cards fly at once; beyond that the stagger compresses.
- Every animated component sets `data-motion="full"|"reduced"` from `useReducedMotion()`, so tests can assert on it.

### 9.2 Event catalogue

`[T]` is the trigger source. Specs use the tokens above.

| # | Event [trigger] | Motion spec | Reduced-motion fallback |
|---|---|---|---|
| 1 | Home mount [mount] | UlamField dots fade by spiral index (stagger 2 ms, total ≤ 987). The SieveGrid strip strikes multiples of 2, 3, 5 and 7 in 4 passes: line `drawLine` 233 `out`, struck cells fade to `--composite`, 144 ms between passes. Hairlines draw centre-out, once per session (sessionStorage `introPlayed`). Counters roll. | Static final state. |
| 2 | Counter / value change [prop] | `NumberGlyph` digit roll, `variants.digit(sign)`, 233 `out`; only changed digits move. | Instant swap. |
| 3 | Join / leave [`presence`, system chat] | Seat `variants.seat` (scale .6→1, soft); leaving reverses to a dashed ◌. | 144 opacity. |
| 4 | Ready toggle [`presence`] | Ring stroke fills clockwise (`pathLength` 0→1, 233 `out`), ✓ draws, the ready-bar tick fills. | Instant. |
| 5 | Rule change [`change-rule`] | The changed SegmentedControl row gets a `--mod` highlight band, `scaleX 0→1` (origin left) over 377 then fades over 233; a log diff chip slides in. | Static highlight 1.6 s. |
| 6 | waiting → playing [`room-status`] | Seats keep `layoutId="seat-{id}"` from the ModRing to the SeatLine/SeatRing (soft, 610 total); the rules pane exits `x −24, opacity 0` over 233. | Crossfade 144. |
| 7 | Deal [`game-start`] | ▣ backs fly deck → seat round-robin along `bezierArc` (card spring), stagger `stagger(total)`, total ≤ 1.2 s. Seat counts tick 0→N. My cards flip `rotateY 180→0` (233 `inOut`) into sorted order with stagger 34 ms. | Hand fades in 144; counts set. |
| 8 | Turn change [ctx.currentPlayer diff] | The `turn-pointer` `layoutId` slides along the SeatLine (377 `inOut`), or the turn radius rotates (snap). The new seat lifts (`y −2`, `scale 1.04`). The timer ring redraws (233). On my turn the hand lifts 4px with one glow pulse (144), and LiveRegion says "あなたの番です". | Pointer jumps; colours change; LiveRegion kept. |
| 9 | Timer tick [`left-time`] | Ring `strokeDashoffset` tweens linearly over 1000 ms. At ≤ 10 s the colour is `--danger`. At ≤ 5 s the digits pulse `scale [1, 1.12, 1]` (233) each tick, and LiveRegion says "残り5秒" once. | No tween or pulse; colour and digits only. |
| 10 | Timeout [my auto-pass at 0] | The ring flashes `--danger` twice (2×144; ≤ 3 flashes/s), and a `時間切れ` chip drops from the seat, then #12. | Chip only. |
| 11 | Draw [`draw`] | A ▣ travels deck → seat along `bezierArc` (lift 40px, 377 `inOut`); the count bumps `scale [1.2, 1]`. **Mine:** it lands in its sorted slot, flips at the apex (233), neighbours reflow (`layout`, card spring), and the card is `fresh`. The deck count rolls. | Card fades into its slot; counts update. |
| 12 | Pass [`pass`] | `∅` pops on the seat (`variants.pop`) and **stays until flow** (dims the seat chip to `--ink-muted`). The pointer moves (#8). | Glyph appears. |
| 13 | Select hand → tray [local] | Shared `layoutId`, card spring (~300 ms). The hand closes the gap. The tray value rolls (#2). | 89 ms fade. |
| 14 | Remove from tray / reset [local] | Reverse `layoutId` flight to the sorted slot. Reset staggers 34 ms in reverse order, and ⟲ spins −360° (233). | Fade. |
| 15 | Tray reaches 57 [local] | The tray border draws in `--gold` (`pathLength`, 377); a `G` superscript pops (bounce); a gold shimmer sweeps across the digits (masked gradient `x −100%→100%`, 987, once). | Gold border + `G`. |
| 16 | Factor mode enter / leave [toggle] | The grid rows morph (layout, soft ~377); the FactorPanel content does `fadeUp`; the operator keys stagger 34 ms. Leaving sends fact cards home via `layoutId`. | Instant expand; 144 fade. |
| 17 | Add fact card / operator [local] | The card flies (`layoutId`); an operator types in (`opacity` + `x −4→0`, 144); `<Expr>` re-typesets with `layout` (the exponent hops into the superscript); the value rolls; `≟`→`=`/`≠` morphs by rotating two strokes (233). | Instant re-render. |
| 18 | Blocked submit [client validation] | The tray does `variants.shake` (damped sine, 377); the border goes `--danger`; an inline message appears under the tray (`aria-live` polite). The existing notification still fires. | Danger border + message. |
| 19 | Submit OK [`submit`, result null] | Cards fly tray (or opponent seat) → field via `layoutId`/`bezierArc`, stagger 34. The previous top shrinks into the sequence (`scale .4`, `x` to the left, opacity .4, 377) and a `<` types in. The field NumberGlyph rolls. The `--prime` underline draws (233). The wide table's sieve prime cells shimmer once (opacity wave by distance, 610). `▲` moves to the submitter (`layoutId="lead"`). Used fact cards `dissolve` toward the deck. | Cards appear; underline shown; fact cards fade. |
| 20 | Fail BASE_IS_NOT_PRIME [`submit`] | The value appears centre-field in `--ink`, then splits into a `FactorTree`: root, then branches `pathLength` 233 per level, prime leaves in `--prime` (`221 → 13 · 17`). A `✗ 合成数` chip in `--danger`. The cards fly back to the submitter, then #23. Factoring happens **only after** the server result. | Static `221 = 13 · 17` text, then counts. |
| 21 | Fail FACT_CONTAIN_NOT_PRIME | The expression shows with the offending factor boxed in `--danger` and `∉ℙ`; the box pulses once (233); return and penalty. | Box shown. |
| 22 | Fail INCORRECT_ANSWER | `lhs = rhs` with `=` morphing to `≠` (233) in `--danger`, both values mono; return and penalty. | Static `≠`. |
| 23 | Penalty draw ×n [`submit` fail] | n ▣ fly deck → seat, stagger `stagger(n)`; the count ticks; a `+n` chip floats `y −12` and fades (610). My new cards are `fresh`. | `+n` chip only. |
| 24 | Field flow 流れ [field non-empty → []] | The sequence readout is struck out like a sieve (a line through each value, stagger 55); field cards sweep into the deck along `logSpiral` (r shrinks by φ per quarter turn, 377 `in`, stagger 34); the deck count rolls up; `▲` fades; `∅` marks clear; the field shows `k = 自由`. | 144 fade + `流れ` chip. |
| 25 | 57 cut [cut57] | A gold diagonal slash draws (`pathLength`, 233 `out`); field cards cleave (each card's two `clipPath` halves translate ±8px and rotate ±4°, then fade, 377; **optional**, falls back to a dissolve); caption `57 — グロタンディーク素数切り` (`--fs-1`, gold, `pop`); then #24; the same seat re-pulses with `もう一度`. Tap or Esc skips. | Gold caption 1597 ms + instant clear. |
| 26 | Game end [director releases `end`] | The winner seat flashes `--gold`; the sieve backdrop ripples outward from that seat (concentric opacity wave, 987); the modal enters (`scale .96→1`, `y 8→0`, soft); the Q.E.D. ∎ `stamp` lands (bounce). Tap or Esc skips to the final state. | Modal fade 144; stamp static. |
| 27 | Next round [`game-start` again] | The modal exits (233 `in`), then #7. | Fade. |
| 28 | Connection lost / reconnect | The board desaturates (`filter: grayscale(.6)`, 377) under the ModRing overlay; on reconnect it fades back. | Overlay only. |
| 29 | Toasts | Mantine notifications restyled: `--surface`, a seat-hue left border for player events, slide `x 16→0` (233). Board events show as in-board chips; toasts are kept for chat, errors, the max-cards message and the tray-wipe helper. | `transitionDuration 0`. |
| 30 | Log entry | `AnimatePresence` push at the top, `fadeUp` with `y −8` (144). | Instant. |
| 31 | Tray wiped by a server event [setHandCardIds while the tray is non-empty] | Tray cards fly home (#14). The one-line helper toast `場が更新されたので選択を戻しました` appears (at most once per 5 s). | Toast only. |

### 9.3 Orchestration: `useBoardDirector` + `classifyTransition`

- **State is always applied immediately** (`setGameState`, `setHandCardIds`, the auto-pass). Only *visual* events are queued.
- `classifyTransition(prev, next, msg, selfId)` is a pure function that returns `BoardEvent[]`:
  - `deal` (the `game-start` action)
  - `draw{me|other, playerId}`
  - `submit-ok{playerId, cards, factor}`
  - `submit-fail{code, playerId, value, factor, penalty = next.hand − prev.hand}`
  - `pass{playerId}`
  - `flow` (prev field non-empty and next field `[]`, not caused by cut57)
  - `cut57` (submit result null, value 57)
  - `turn{from, to}`
- **Director queue (FIFO):**
  - Each event resolves after its spec duration, or when `done()` is called by the animating component.
  - **Hold rule:** `game-end` and `room-status: waitingNextRound` are held until the next `submit-*` event has played, or **800 ms** pass, whichever is first. Only then does `GameSetDialog` open.
  - **Backlog:** with a queue length > 3, the remaining steps play at 0.5× duration. With > 6, intermediate events are dropped and the director jumps to the latest state.
  - **Reduced motion:** every duration is 144 ms or less.

### 9.4 Reduced-motion policy

- `useReducedMotion()` → `motionPreset(true)`. Travel becomes opacity crossfades of 144 ms or less.
- Shakes, shimmers, ripples, flips, cleaves and spirals are removed.
- **Information is never lost:** colour, glyph and text changes stay, and LiveRegion messages stay.
- Background Sieve and Ulam layers render statically. Mantine gets `transitionProps={{ duration: 0 }}` via the theme when reduced.
- No effect flashes more than 3 times per second.

### 9.5 Keyboard shortcuts (board; `Kbd` hints only for `pointer:fine`)

| Key | Action |
|---|---|
| `D` | 引く |
| `P` | パス |
| `Enter` (no focused button) | 出す |
| `F` | 素因数分解 |
| `X` / `*` | `·` |
| `^` | `^` |
| `Backspace` | Remove the last tray or fact card |
| `Esc` | Reset; also skips a ceremony |
| `L` | Toggle the log |

Shortcuts are ignored while typing in inputs.

---

## 10. Test strategy

### 10.1 Tooling (Foundation)

- `vitest.config.ts`:
  - `esbuild: { jsx: 'automatic' }` and a top-level `resolve.alias['@']`.
  - `optimizeDeps.include: ['@storybook/experimental-nextjs-vite','@mantine/core','@mantine/hooks','react/jsx-dev-runtime','framer-motion']`.
  - `test.projects`:
    - `unit`: jsdom, `vitest.setup.ts`, include `src/**/*.test.{ts,tsx}`.
    - `storybook`: `storybookTest` plugin, browser playwright chromium headless, setup `.storybook/vitest.setup.ts`. Enable it only when the env var `STORYBOOK_TESTS=1` is set or via `npm run test:storybook`, so that `npm test` never needs a browser binary.
  - `coverage`: provider v8, `include: ['src/**']`, `exclude: ['src/game-card/src/components/icons/**','src/partykit/**','**/*.stories.*','src/app/labo/gallery/**']`. Thresholds for `src/design/**` and `src/app/room/[id]/_ui/board/**`: lines 85, branches 75.
- `vitest.setup.ts`:
  - jest-dom/vitest and RTL `cleanup`.
  - `matchMedia` mock (configurable via `mockMatchMedia`), `ResizeObserver`, `scrollIntoView`, `getComputedStyle` shim, and `IntersectionObserver`.
  - `MotionGlobalConfig.skipAnimations = true`.
- `package.json` scripts:
  - `"test": "vitest run --project unit"`
  - `"test:storybook": "STORYBOOK_TESTS=1 vitest run --project storybook"`
  - `"test:coverage": "vitest run --project unit --coverage"`
  - `"screens": "node scripts/screens.mjs"`
- Browser: `npx playwright install chromium`, or `PW_CHROMIUM_PATH` pointing at an existing headless shell; `scripts/screens.mjs` and the vitest browser instance read that env var.
- Standard mocks:
  - `vi.mock('partysocket/react')` returns a controllable fake socket (`__emit(payload)`, `send` spy, `id`).
  - `vi.mock('js-cookie')`.
  - `vi.mock('@mantine/notifications', …)` with a spy, where it is asserted.

### 10.2 Characterization tests: written FIRST, before any refactor (Foundation)

- **`src/app/room/[id]/hooks.test.ts`:**
  - `useMessageHandler`: each payload type reaches its handler.
  - **No** `onGameEvent` on `sync` or `change-rule`.
  - `onGameEvent` runs before the specific handler.
  - Invalid JSON or schema is rejected without crashing.
  - `useMyField`: select moves a card hand → tray; the maxSubmit cap fires the notification text `1度に出せるカードは N 枚までです`; remove/reset re-sort with `compareCard`; `setHandCardIds` clears both trays and the mode; `toggleMode` returns the fact cards.
- **`client-messenger.test.ts`:** payload snapshots for every static method.
- **`src/app/room/[id]/_ui/game-board.test.tsx`** (characterization, kept green through T3's rewrite):
  - With the mocked socket, a scripted presence → room-status → game-start sequence renders the hand.
  - `left-time 0` sends `pass` only when self is `currentPlayer`.
  - An observer gets no hand.
  - The GAME SET dialog is shown after `waitingNextRound`.

  Write this against roles and text (`button {name: /パス|pass/}`) so that it survives the redesign. T3 updates the matchers to the Japanese labels only.

### 10.3 Unit tests per new or changed module (owner = file owner)

| Module | Required assertions |
|---|---|
| `design/tokens.test.ts` | Every `TEXT_TOKENS` entry ≥ 4.5 on bg/surface/raised in both schemes; `--border-strong` ≥ 3; `--on-prime` on `--prime` ≥ 4.5; the seat hues ≥ 4.5 on bg/surface; CSS in `globals.css` matches `TOKENS` (parse the file and compare hex values). |
| `design/motion.test.ts` | `DUR` values are Fibonacci ms; `dampedShake` starts and ends at 0 and its envelope is monotonically non-increasing; `stagger(count)·count ≤ 1.2`; `motionPreset(true)` durations ≤ .144. |
| `design/math/sieve.test.ts` | 25 primes below 100; `sieve(1)` handles the 0/1 edge cases. |
| `design/math/ulam.test.ts` | Coordinates of 1..9 (1→(0,0), 2→(1,0), 3→(1,−1)…); uniqueness for 441 cells. |
| `design/math/factorize.test.ts` | 221 → [13,17]; 57 → [3,19]; prime → [p]; 0 and 1 → []; a BigInt above MAX_SAFE_INTEGER; budget exceeded → null. |
| `design/math/geometry.test.ts` | `seatAngle(0,n) = π/2`; angles are evenly spaced; `fanLayout` symmetric, switches to scroll below the slice threshold, never wider than W for n ∈ [1, 52]; `timerDash` 0 at full, C at 0, clamps negatives; `bezierArc` endpoints are exact; `logSpiral` radius shrinks by φ per quarter turn; `phyllotaxis` scale = φ^−age. |
| `design/use-layout-mode.test.ts` | Each mode with mocked matchMedia; priority order; SSR default. |
| `design/NumberGlyph.test.tsx` | `null` renders `—`; `tabular-nums` class; tone classes; `srLabel`. |
| `design/Expr.test.tsx` | `2^3*3` renders `2`, `<sup>3</sup>`, `·`, `3`; adjacent cards join; `aria-label`; `highlightIndex` is boxed. |
| `design/SieveGrid / UlamField / ModRing / FactorTree .test.tsx` | Prime cell count; `aria-hidden`; static under reduced motion (`data-motion="reduced"`); FactorTree with `null` shows the omitted text. |
| `game-card/tools/card-label.test.ts` | Labels and values for A, 10, J, Q, K, Back. |
| `game-card/.../game-card.test.tsx` | Default role `option`; `fontSize` passthrough; default `aria-label`; caller override. |
| `game-card/.../math-card.test.tsx` | `data-state` per state; disabled → `aria-disabled` + opacity 1; `onActivate` on Enter/Space; `layoutId` is set. |
| `components/playing-card-line.test.tsx` | `onClickCard(card, idx)`; **no unknown-prop warning** (spy on `console.error`). |
| `board/Hand.test.tsx` | listbox/option roles; ←/→ roving tabindex; Enter → `onSelect`; scroll mode for n = 30 at small W; `freshIds` get `data-state="fresh"`. |
| `board/SubmitTray.test.tsx` | Value; `≟`; the 57 gold `G` (`data-grothendieck`); count/greater checks; **anti-spoiler**: no text matching `/素数|prime|∈ℙ/` before a result; `shakeKey` change → `data-shake`. |
| `board/FactorPanel.test.tsx` | Value only when valid; `=` vs `≠` against the target; operator buttons call back; 44px buttons. |
| `board/card-tray-utils.test.ts` | Truth table for the checks. |
| `board/Seat.test.tsx` | Opponent: count only, **no `role=option` faces**; `観戦`; `▲`; `∅`; active → `aria-current="true"`; hue var. |
| `board/SeatLine / SeatRing .test.tsx` | Order rotated to self; observers excluded; no active seat when `currentPlayer` ∉ players. |
| `board/TurnTimer.test.tsx` | dashoffset maths; negative → `0`; urgency at 10 and 5; `role="timer"` with aria values. |
| `board/FieldStack / FieldSequence .test.tsx` | `13 < 47 < 1013`; `k = 2 枚 · > 1013`; `k = 自由`; collapse to `… <` past 3. |
| `board/DeckPile.test.tsx` | Disabled reasons as tooltip text; `onDraw`. |
| `board/ResultOverlay.test.tsx` | One case per result code, including penalty `+n`. |
| `board/GrothendieckCut.test.tsx` | Caption; Esc/tap → `onDone`. |
| `board/GameSetDialog.test.tsx` | Winner; standings; CTA → `onNextRound`; Q.E.D. |
| `board/seat-model.test.ts` | Rotation, observers, lead, passed. |
| `board/classify-transition.test.ts` | Table-driven: deal, draw me/other, submit-ok, 57 → cut57 (not flow), flow after pass, each failure code with penalty counts, pass, turn. |
| `board/use-board-director.test.ts` | FIFO; holds end/status until submit; releases after 800 ms (fake timers); 0.5× when queue > 3; drops when > 6. |
| `board/ActionBar.test.tsx` | Disabled states; shortcuts D/P/F/Enter; 55px primary on `rail`. |
| `board/ConnectionOverlay / ProofLog / LiveRegion .test.tsx` | States; numbering; `aria-live`. |
| `board/rule-diff.test.ts` | `t: 60 → 15 s`, `|H₀|: 8 → 11`, `k_max: 4 → ∞`, `偶数半減: OFF → ON`. |
| `room/[id]/_ui/QRButton.test.tsx`, `notification-message.test.tsx`, `RoomHeader.test.tsx` | Props contract; copy button; no nested `<p>`. |
| `room/[id]/page.test.tsx` | Renders without `window` access during render (SSR: `renderToString` does not throw); `cardSizeOption` → `data-card-size`. |
| `app/page.test.tsx` (home) | `—` before the lobby message; counts after a mocked message; disabled buttons are not links. |
| `app/login/page.test.tsx` | Meter ticks; invalid disables the button; submit sets the cookie and assigns `location.pathname` to the callback. |
| `app/room/new/loading.test.tsx`, `error.test.tsx` | Caption; retry link. |
| `room/[id]/_ui/waiting-room.test.tsx` | Start disabled with fewer than 2 ready; each SegmentedControl calls `onChangeRule` with the original values (15/60/300, 4/8/11, 4/52, halfEvenNumbers bool); ready/unready callbacks. |
| `app/_ui/nav-burger.test.tsx`, `device-rotate-recommender.test.tsx` | Fullscreen icon correct; inline placement; banner honours sessionStorage. |
| `labo/calc/page.test.tsx` | Hotkeys 1–9/0/j/q/k/Esc/Backspace; factor text; empty → `—`. |
| Reduced motion (each animated component) | With `mockMatchMedia({'(prefers-reduced-motion: reduce)': true})` → `data-motion="reduced"`, and shimmer/shake nodes are absent. |

### 10.4 Storybook (8.6, `@storybook/experimental-nextjs-vite`)

- `preview.tsx`: the theme `MantineProvider`, `MotionProvider`, a `colorScheme` global toolbar (light/dark) and viewports `compact 844×390`, `portrait 390×844` and `wide 1440×900`.
- Stories with `play` functions (`@storybook/test` `within/userEvent/expect`) for every board component, the shared primitives, MathCard/Hand/Tray/FactorPanel, WaitingRoom and GameSetDialog.
- **Full-board scenario stories** reuse the gallery fixtures: `Playing/MyTurn`, `Playing/FactorMode`, `Result/NotPrime`, `Result/Cut57`, `Result/GameSet`, `Observer`, `Connecting`.
- The existing two stories are rewritten without template comments.
- `npm run build-storybook` stays green (CI).

### 10.5 Design gallery and Playwright screenshot smoke (no PartyKit)

- `/labo/gallery?scene=<id>&scheme=light|dark` renders `BoardLayout` with the real presentational components fed from `gallery/fixtures.ts` (mock `GameState`, `Ctx`, presence).
  - Scenes: `home-parts`, `waiting`, `my-turn`, `opp-turn`, `factor`, `not-prime`, `cut57`, `flow`, `game-set`, `observer`, `connecting`.
  - It uses no socket, and the middleware does not guard `/labo`.
- `scripts/screens.mjs` assumes `next dev -p 3123` is already running, or starts it itself. It uses `playwright` (installed) `chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH })` and, for each scene × {844×390, 390×844, 1440×900} × {light, dark}, writes screenshots to `docs/design/screens/` (gitignored). It also captures `/`, `/login` and `/labo/calc`.
  - Pages load with `reducedMotion: 'reduce'` for deterministic frames.
  - It exits non-zero on console errors (socket errors on `/` are allowed).
- **Optional (not in CI):** the two-context full flow against `partykit dev`, documented in the script header.

### 10.6 CI gates

`npm test` (unit), `npx tsc --noEmit`, `npx biome ci src` (new files must pass), `npm run build` and `npm run build-storybook`. The 27 existing logic tests stay unchanged and green. `git diff --stat src/partykit src/utils/play-card.ts src/interface` must be empty.

---

## 11. Implementation plan

### Ownership rules

- Each file below has **exactly one owner**. A task may create or modify only its listed files.
- Shared contracts (prop types, the barrel, placeholder stubs) are created by **Foundation**. Each downstream task then *takes ownership* of its stub files and replaces them.
- Cross-task imports go only through the paths and props fixed in §6.
- **Forbidden for everyone:**
  - `src/partykit/**`, `src/utils/play-card.ts`, `src/interface/**`
  - `src/app/room/[id]/client-messenger.ts`, `room-manager.ts`, `hooks.ts`
  - `src/middleware.ts`, `src/app/room/new/page.tsx`
- Generated card face icons (`src/game-card/src/components/icons/*` except `Back.tsx`) are untouched.

### F. Foundation (sequential, first)

**Files (create/modify):**
- **Config and scripts:** `vitest.config.ts`, `vitest.setup.ts`, `package.json` (scripts; remove `daisyui`), `package-lock.json` (only via `npm uninstall daisyui`), `.gitignore` (add `docs/design/screens/`), `.storybook/preview.tsx`, `.storybook/main.ts`, `.storybook/vitest.setup.ts`.
- **App shell:** `src/app/globals.css`, `src/app/layout.tsx`, `src/app/manifest.json`, `src/app/icon.svg`, `src/app/_ui/device-rotate-recommender.tsx` (+ `.test.tsx`), which is rebuilt as a Mantine banner/Modal, same default export and sessionStorage key, because daisyUI is removed here.
- **Design system:** `src/design/tokens.ts`, `theme.ts`, `fonts.ts`, `motion.ts`, `motion-provider.tsx`, `use-layout-mode.ts`, `NumberGlyph.tsx`, `Expr.tsx`, `icons.tsx`, `SieveGrid.tsx`, `UlamField.tsx`, `ModRing.tsx`, `FactorTree.tsx`, `math/sieve.ts`, `math/ulam.ts`, `math/factorize.ts`, `math/geometry.ts`, plus `*.test.ts(x)` for each and `src/design/*.stories.tsx`.
- **Test utilities:** `src/test-utils.tsx`, `src/test-mocks/partysocket.ts`.
- **Characterization tests:** `src/app/room/[id]/hooks.test.ts`, `src/app/room/[id]/client-messenger.test.ts`, `src/app/room/[id]/_ui/game-board.test.tsx` (ownership passes to T3 afterwards).
- **Board contracts:** `src/app/room/[id]/_ui/board/types.ts`, `board/index.ts` (barrel exporting every board component name in §6.3/6.4 and §6.2), and **placeholder stubs** for every board component file listed under T1, T2 and T3. Each stub has the final props interface and returns minimal markup with `data-stub`.
- **Housekeeping:** delete `src/__tmp_sanity__/` if present.

**Acceptance:**
- `npm test` is green, with the 27 existing tests plus the new ones.
- `npx tsc --noEmit` is clean. `npm run build-storybook` passes.
- The app renders with tokens: no gradient, Geist loaded, `lang="ja"`, `<Analytics/>` in the body, dark mode follows the OS.
- Mantine layered CSS is in place; daisyUI is gone and the rotate dialog still works.
- Contrast test passes. Every math helper meets §10.3.
- Characterization tests pass against the **current** `game-board.tsx`.

### T1. `cards`: card frame, back, hand, tray, factor panel

**Files:**
- `src/game-card/src/components/game-card.tsx`
- `src/game-card/src/components/math-card.tsx`
- `src/game-card/src/components/icons/Back.tsx`
- `src/game-card/src/components/index.ts`, `src/game-card/src/index.ts`
- `src/game-card/src/tools/card-label.ts`
- `src/game-card/src/components/game-card.stories.tsx`
- `src/components/playing-card-line.tsx`, `src/components/playing-card-line.stories.ts`(x)
- `src/app/room/[id]/_ui/board/Hand.tsx`, `SubmitTray.tsx`, `FactorPanel.tsx`, `card-tray-utils.ts`
- Tests: `card-label.test.ts`, `game-card.test.tsx`, `math-card.test.tsx`, `playing-card-line.test.tsx`, `Hand.test.tsx`, `SubmitTray.test.tsx`, `FactorPanel.test.tsx`, `card-tray-utils.test.ts`, and stories `Hand.stories.tsx`, `SubmitTray.stories.tsx`, `FactorPanel.stories.tsx`, `MathCard.stories.tsx`.

**Acceptance:**
- The `GameCard` contract is unchanged (the stories' `onClick` and `fontSize` still work).
- The Ulam back keeps its viewBox.
- `PlayingCardLine` produces no DOM prop warnings.
- Hand keyboard a11y and the fan/scroll switch work.
- The tray shows checks and the 57 state with no primality text.
- The FactorPanel `=`/`≠` appears only when valid.
- §8.1 states are implemented with `layoutId={`card-${id}`}`.
- Every test in §10.3 for these files passes; there are stories with play functions.

### T2. `table`: seats, timer, field, deck, results, ceremonies

**Files:** under `src/app/room/[id]/_ui/board/`:
- `Seat.tsx`, `SeatLine.tsx`, `SeatRing.tsx`, `TurnTimer.tsx`, `FieldStack.tsx`, `FieldSequence.tsx`, `DeckPile.tsx`, `ResultOverlay.tsx`, `GrothendieckCut.tsx`, `GameSetDialog.tsx`, `seat-model.ts`
- A `.test.tsx`/`.test.ts` and a `.stories.tsx` for each.

**Acceptance:**
- Opponents never render faces.
- Observers and the no-active-seat quirk are handled.
- The timer clamps, shows urgency and has aria attributes.
- The sequence and constraint readouts render.
- Each result code is visualised, with factor trees via `factorize` only for the post-result props.
- 57 and the game-end ceremonies can be skipped.
- The GameSet uses "Theorem/Proof/∎" copy and the CTA callback.
- Reduced-motion variants carry `data-motion`.
- Every test in §10.3 passes.

### T3. `board`: container, director, layout, room chrome

**Files:**
- `src/app/room/[id]/_ui/game-board.tsx` (+ the inherited `game-board.test.tsx`)
- Under `board/`: `BoardLayout.tsx`, `ActionBar.tsx`, `ConnectionOverlay.tsx`, `ProofLog.tsx`, `LiveRegion.tsx`, `use-board-director.ts`, `classify-transition.ts`, `rule-diff.ts`
- `src/app/room/[id]/page.tsx`, `src/app/room/[id]/layout.tsx`
- `src/app/room/[id]/_ui/RoomHeader.tsx`, `QRButton.tsx`, `notification-message.tsx`
- Tests and stories for each of these, plus `page.test.tsx`.

**Acceptance:**
- `game-board.tsx` is a thin container under about 250 lines.
- Same export and props; same `ClientMessenger` calls and payloads.
- The `validateSubmitCardSet` messages are unchanged.
- Auto-pass happens only for the current player.
- Tray wipe on server events is kept, and animated with the helper toast.
- The director reorders the game end (an integration test feeds `game-end`, `room-status`, `submit` and asserts the dialog opens after the submit).
- Compact, portrait, regular and wide grid areas follow §7.5–7.6, including the right-rail actions with a 55px 出す.
- Keyboard shortcuts work.
- `page.tsx` is SSR-safe. `cardSizeOption` drives `data-card-size`. QR is `defaultOpened` only off compact.
- The characterization tests stay green, updated only for labels.

### T4. `screens`: home, login, room/new loading, waiting room, nav

**Files:**
- `src/app/page.tsx`, `src/app/_ui/home-hero.tsx`
- `src/app/login/page.tsx`, `src/app/login/layout.tsx`, `src/app/login/name-length-meter.tsx`
- `src/app/room/new/loading.tsx`, `src/app/room/new/error.tsx`
- `src/app/room/[id]/_ui/waiting-room.tsx`
- `src/app/_ui/nav-burger.tsx`
- Tests (`page.test.tsx` for home, `login/page.test.tsx`, `name-length-meter.test.tsx`, `loading.test.tsx`, `error.test.tsx`, `waiting-room.test.tsx`, `nav-burger.test.tsx`) and stories (`waiting-room.stories.tsx`, `home-hero.stories.tsx`).

**Acceptance:**
- Wireframes §7.1–7.4 are implemented in all three modes.
- Lobby counts show `—` until the first message.
- Disabled buttons are not links. External URLs are unchanged.
- Login cookie and callback behaviour are byte-identical in effect.
- The `/room/new` page is untouched.
- WaitingRoom props and rule values are unchanged, with axioms notation and the ready bar.
- The nav fullscreen icon is fixed and `placement="inline"` works.
- Every test in §10.3 passes.

### T5. `labo`: calc, design gallery, screenshot smoke

**Files:**
- `src/app/labo/layout.tsx`, `src/app/labo/calc/page.tsx` (+ `calc/page.test.tsx`)
- `src/app/labo/gallery/page.tsx`, `src/app/labo/gallery/fixtures.ts` (+ `fixtures.test.ts`, which validates the fixtures against `serverToClientSchema` and the game-state types)
- `scripts/screens.mjs`
- `docs/design/screens/.gitkeep`

The gallery imports board components only through `board/index.ts`, so it works against stubs and lights up as T1–T3 land.

**Acceptance:**
- Calc follows §7.8 with hotkeys unchanged and an empty selection shown as `—`.
- The gallery renders every scene in §10.5 without a socket.
- `npm run screens` produces 11 scenes × 3 viewports × 2 schemes plus static pages, with no console errors.
- The fixtures test passes.

### Merge order and integration

F, then (T1 ∥ T2 ∥ T3 ∥ T4 ∥ T5), then a final integration pass by the lead. The integration pass runs:
- the full test suite, `tsc`, `biome ci src`, `build-storybook` and `npm run screens`;
- a visual review of the screenshots;
- `git diff --stat` on the forbidden paths, which must be empty.

T3's integration tests and T5's gallery depend on T1 and T2 at runtime only. Until those tasks land, the stubs keep them compiling.
