'use client'

import { NumberGlyph } from '@/design/NumberGlyph'
import { IconModRing, IconTherefore } from '@/design/icons'
import { DUR, EASE } from '@/design/motion'
import { useLayoutMode } from '@/design/use-layout-mode'
import { useLobbyStats } from '@/lib/use-lobby-stats'
import { Button } from '@mantine/core'
import {
  IconArrowRight,
  IconArrowUpRight,
  IconBrandX,
  IconMessageReport,
  IconSpeakerphone,
} from '@tabler/icons-react'
import { m } from 'framer-motion'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Hairline, HomeHero, type HomeHeroVariant, useHomeIntro } from './_ui/home-hero'

const URLS = {
  rules: 'https://primeqk.themedia.jp/pages/4500251/rules',
  feedback: 'https://forms.gle/1Aaexb2zNy39nPPF8',
  releaseNotes: 'https://tomatommy.notion.site/Prime-Daifugo-1fa4870920958036adabf9f4a7185fa2',
  x: 'https://x.com/TomaTommy123',
} as const

const ICON = { stroke: 1.5, size: '1.25em' } as const

// The CTAs arrive once the sieve passes have run (4 × (233 + 144) ms).
const CTA_DELAY = 4 * (DUR.md + DUR.sm) * 0.7

export default function Home() {
  // null until the first lobby frame: the counters show "—" instead of a fake 0.
  const stats = useLobbyStats()
  const mode = useLayoutMode()
  const intro = useHomeIntro()
  const play = intro === 'play'

  const variant: HomeHeroVariant =
    mode === 'compact' ? 'compact' : mode === 'portrait' ? 'portrait' : 'stack'
  const compact = variant === 'compact'

  const counters = (
    <LobbyCounters
      online={stats?.online ?? null}
      lobby={stats?.lobby ?? null}
      rooms={stats?.rooms ?? null}
      inline={compact}
    />
  )
  const actions = <HomeActions play={play} short={compact} />
  const links = <FooterLinks play={play} scrim={!compact} />

  return (
    <main
      className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-fib-4 py-fib-5"
      style={{
        paddingInline: 'max(var(--sp-4), env(safe-area-inset-left), env(safe-area-inset-right))',
      }}
      data-layout={variant}
    >
      {compact ? (
        <div
          // tops aligned: the hero column is taller, so centring left the CTA column higher
          className="grid w-full max-w-[987px] items-start gap-fib-5 rounded-[var(--r-3)] p-fib-4"
          style={{
            gridTemplateColumns: 'minmax(0, 0.618fr) minmax(0, 0.382fr)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-2)',
          }}
        >
          <section aria-label="素数大富豪" className="flex min-w-0 flex-col gap-fib-3">
            <HomeHero intro={intro} variant="compact" />
            {counters}
          </section>
          <section aria-label="メニュー" className="flex min-w-0 flex-col gap-fib-3">
            {actions}
            {links}
          </section>
        </div>
      ) : (
        <>
          <div
            className="flex w-full max-w-[610px] flex-col gap-fib-4 rounded-[var(--r-3)]"
            style={{
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-2)',
              padding: variant === 'portrait' ? 'var(--sp-4)' : 'var(--sp-5)',
            }}
          >
            <HomeHero intro={intro} variant={variant} />
            {counters}
            <Hairline play={play} delay={play ? CTA_DELAY : 0} />
            {actions}
          </div>
          {links}
        </>
      )}
    </main>
  )
}

/* ------------------------------------------------------------------ */

type CountersProps = {
  online: number | null
  lobby: number | null
  rooms: number | null
  inline: boolean
}

function LobbyCounters({ online, lobby, rooms, inline }: CountersProps) {
  const items = [
    { key: 'online', value: online, label: 'オンライン' },
    { key: 'lobby', value: lobby, label: 'ロビー' },
    { key: 'rooms', value: rooms, label: '部屋' },
  ] as const

  if (inline) {
    return (
      <dl className="m-0 flex flex-wrap items-baseline gap-x-fib-2 gap-y-fib-1">
        {items.map((item, i) => (
          <div
            key={item.key}
            data-counter={item.key}
            className={[
              'flex items-baseline gap-fib-1',
              i > 0
                ? "before:order-0 before:pr-fib-1 before:text-ink-muted before:content-['·']"
                : '',
            ].join(' ')}
          >
            <dd className="m-0 order-1">
              <NumberGlyph
                value={item.value}
                size={2}
                srLabel={item.value === null ? '取得中' : undefined}
              />
            </dd>
            <dt className="order-2 text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
              {item.label}
            </dt>
          </div>
        ))}
      </dl>
    )
  }

  return (
    <dl className="m-0 grid grid-cols-3">
      {items.map((item, i) => (
        <div
          key={item.key}
          data-counter={item.key}
          className="flex flex-col-reverse gap-fib-1 px-fib-3"
          style={{ borderLeft: i > 0 ? '1px solid var(--line)' : undefined }}
        >
          <dt className="font-semibold text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
            {item.label}
          </dt>
          <dd className="m-0">
            <NumberGlyph
              value={item.value}
              size={4}
              tone={item.value === null ? 'muted' : 'ink'}
              srLabel={item.value === null ? '取得中' : undefined}
            />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ------------------------------------------------------------------ */

function Reveal({ play, delay, children }: { play: boolean; delay: number; children: ReactNode }) {
  return (
    <m.div
      initial={play ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.md, ease: EASE.out, delay: play ? delay : 0 }}
    >
      {children}
    </m.div>
  )
}

function HomeActions({ play, short }: { play: boolean; short: boolean }) {
  return (
    <nav aria-label="ゲームメニュー" className="flex flex-col gap-fib-3">
      <Reveal play={play} delay={CTA_DELAY}>
        <Button
          component={Link}
          href="/room/new"
          fullWidth={true}
          size="md"
          h={55}
          rightSection={<IconArrowRight {...ICON} />}
          styles={{ label: { fontSize: 'var(--fs-1)', fontWeight: 700 } }}
        >
          ルーム作成
        </Button>
      </Reveal>
      <Reveal play={play} delay={CTA_DELAY + 0.034}>
        {/* Not implemented yet: a real disabled button, deliberately not wrapped in a link. */}
        <Button
          disabled={true}
          fullWidth={true}
          variant="default"
          leftSection={<IconModRing n={4} style={{ fontSize: '1.25em' }} />}
        >
          ランダムマッチ · 準備中
        </Button>
      </Reveal>
      <Reveal play={play} delay={CTA_DELAY + 0.068}>
        <div className="grid grid-cols-2 gap-fib-3">
          <Button
            component="a"
            href={URLS.rules}
            aria-label={short ? 'ゲームルール' : undefined}
            target="_blank"
            rel="noopener noreferrer"
            variant="default"
            rightSection={<IconArrowUpRight {...ICON} />}
          >
            {short ? 'ルール' : 'ゲームルール'}
          </Button>
          <Button
            component={Link}
            href="/labo/calc"
            aria-label={short ? '素数判定ラボ' : undefined}
            variant="default"
            rightSection={<IconTherefore style={{ fontSize: '1.25em' }} />}
          >
            {short ? 'ラボ' : '素数判定ラボ'}
          </Button>
        </div>
      </Reveal>
    </nav>
  )
}

/** `scrim`: on the bare page (not inside the card) the links get a backing over the Ulam field. */
function FooterLinks({ play, scrim = false }: { play: boolean; scrim?: boolean }) {
  const linkClass =
    'inline-flex min-h-[44px] items-center gap-fib-1 px-fib-2 text-ink-muted no-underline hover:text-ink'
  return (
    <Reveal play={play} delay={CTA_DELAY + 0.144}>
      <nav
        aria-label="関連リンク"
        data-scrim={scrim ? 'true' : undefined}
        className={`flex flex-wrap items-center justify-center ${scrim ? 'rounded-[var(--r-3)] bg-bg/90 px-fib-2' : ''}`}
        style={{ fontSize: 'var(--fs--1)' }}
      >
        <a className={linkClass} href={URLS.feedback} target="_blank" rel="noopener noreferrer">
          <IconMessageReport {...ICON} />
          フィードバック ↗
        </a>
        <a className={linkClass} href={URLS.releaseNotes} target="_blank" rel="noopener noreferrer">
          <IconSpeakerphone {...ICON} />
          更新履歴 ↗
        </a>
        <a className={linkClass} href={URLS.x} target="_blank" rel="noopener noreferrer">
          <IconBrandX {...ICON} />X ↗
        </a>
        <Button
          disabled={true}
          variant="subtle"
          size="compact-sm"
          mih={44}
          // a quiet text-like item beside the footer links, still a real disabled button
          styles={{ root: { background: 'transparent', fontWeight: 400 } }}
        >
          トレーニング · 準備中
        </Button>
      </nav>
    </Reveal>
  )
}
