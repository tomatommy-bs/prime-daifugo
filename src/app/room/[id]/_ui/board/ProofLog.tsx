'use client'
/**
 * 証明ログ (§6.4, §9.2 #30). The game log read as a numbered proof: newest first, each line
 * numbered `(n)`, a margin glyph per kind (∴ play, ✗ fail, ∅ pass, ∎ end, · system).
 * `variant="sidebar"` is the wide layout's 320px column; `variant="drawer"` is a right Drawer.
 */
import { DUR, EASE, useMotionMode } from '@/design/motion'
import { Drawer, ScrollArea } from '@mantine/core'
import { AnimatePresence, m } from 'framer-motion'
import type { LogEntry } from './types'

export type ProofLogProps = {
  /** newest first */
  entries: LogEntry[]
  variant: 'sidebar' | 'drawer'
  opened?: boolean
  onClose?: () => void
}

type Kind = NonNullable<LogEntry['kind']>

export const KIND_GLYPH: Record<Kind, { glyph: string; className: string; label: string }> = {
  play: { glyph: '∴', className: 'text-prime', label: '提出' },
  fail: { glyph: '✗', className: 'text-danger', label: '失敗' },
  pass: { glyph: '∅', className: 'text-ink-muted', label: 'パス' },
  end: { glyph: '∎', className: 'text-gold', label: '終了' },
  system: { glyph: '·', className: 'text-ink-muted', label: 'システム' },
}

function Title() {
  return (
    <span className="flex items-baseline gap-fib-2 font-bold">
      証明ログ
      <span aria-hidden="true" className="num text-mod">
        ∴
      </span>
    </span>
  )
}

function Lines({ entries }: { entries: LogEntry[] }) {
  const motion = useMotionMode()
  const total = entries.length
  return (
    <ol
      aria-live="polite"
      aria-relevant="additions"
      aria-label="証明ログ"
      data-motion={motion}
      className="m-0 flex list-none flex-col p-0"
    >
      <AnimatePresence initial={false}>
        {entries.map((entry, i) => {
          const kind: Kind = entry.kind ?? 'system'
          const g = KIND_GLYPH[kind]
          const n = total - i
          return (
            <m.li
              key={entry.id}
              data-kind={kind}
              data-n={n}
              layout={motion === 'full' ? 'position' : false}
              initial={motion === 'full' ? { opacity: 0, y: -8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.sm, ease: EASE.out }}
              className="grid grid-cols-[3ch_1.25em_minmax(0,1fr)] items-baseline gap-x-fib-2 border-b border-line/60 px-fib-3 py-fib-2 text-[length:var(--fs--1)] leading-[1.5] text-ink last:border-b-0"
            >
              <span className="num text-right text-ink-muted tabular-nums" aria-hidden="true">
                ({n})
              </span>
              <span aria-hidden="true" className={`num text-center font-bold ${g.className}`}>
                {g.glyph}
              </span>
              <span className="sr-only">
                {n}. {g.label}:
              </span>
              <div className="min-w-0 break-words">{entry.node}</div>
            </m.li>
          )
        })}
      </AnimatePresence>
      {total === 0 ? (
        <li className="px-fib-3 py-fib-4 text-center text-[length:var(--fs--1)] text-ink-muted">
          まだ何も証明されていません
        </li>
      ) : null}
    </ol>
  )
}

export function ProofLog({ entries, variant, opened = true, onClose }: ProofLogProps) {
  if (variant === 'drawer') {
    return (
      <Drawer
        opened={opened}
        onClose={onClose ?? (() => undefined)}
        position="right"
        size={320}
        title={<Title />}
        closeButtonProps={{ 'aria-label': '閉じる' }}
        styles={{
          content: { background: 'var(--surface)' },
          header: { background: 'var(--surface)', borderBottom: '1px solid var(--line)' },
          body: { padding: 0 },
        }}
      >
        <section aria-label="証明ログ" data-proof-log="drawer">
          <Lines entries={entries} />
        </section>
      </Drawer>
    )
  }

  return (
    <section
      aria-label="証明ログ"
      data-proof-log="sidebar"
      className="flex h-full min-h-0 flex-col bg-surface"
    >
      <header className="flex h-[52px] shrink-0 items-center border-b border-line px-fib-3">
        <Title />
        <span className="num ml-auto text-[length:var(--fs--1)] text-ink-muted">
          {entries.length}
        </span>
      </header>
      <ScrollArea className="min-h-0 flex-1" type="hover" scrollbarSize={6}>
        <Lines entries={entries} />
      </ScrollArea>
    </section>
  )
}
