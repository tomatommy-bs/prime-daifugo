'use client'

import { TIMES } from '@/design/Expr'
import { useMotionPreset } from '@/design/motion'
import { IconCheck, IconX } from '@tabler/icons-react'
import { m } from 'framer-motion'
import type { ReactNode } from 'react'

/** The answer verdict (an `<output>`, announced politely) with the explanation below. */
export function Feedback({
  correct,
  title,
  children,
}: { correct: boolean; title?: string; children?: ReactNode }) {
  const preset = useMotionPreset()
  return (
    <m.output
      variants={preset.fadeUp}
      initial="hidden"
      animate="show"
      data-feedback={correct ? 'correct' : 'wrong'}
      className="flex flex-col gap-fib-2 rounded-[var(--r-2)] border border-line bg-bg p-fib-3"
    >
      <p
        className={`m-0 inline-flex items-center gap-fib-1 font-bold text-[length:var(--fs-1)] ${correct ? 'text-prime' : 'text-danger'}`}
      >
        {correct ? (
          <IconCheck stroke={2} size="1.1em" aria-hidden="true" />
        ) : (
          <IconX stroke={2} size="1.1em" aria-hidden="true" />
        )}
        {title ?? (correct ? '正解' : '不正解')}
      </p>
      {children}
    </m.output>
  )
}

/** `[[2, 2], [3, 1]]` typeset as 2² · 3. */
export function PowerProduct({ powers }: { powers: readonly [number, number][] }) {
  const label = powers.map(([p, e]) => (e > 1 ? `${p} の ${e} 乗` : `${p}`)).join(' 掛ける ')
  return (
    <span className="num" role="math" aria-label={label}>
      {powers.map(([p, e], i) => (
        <span key={p}>
          {i > 0 ? <span className="text-factor">{TIMES}</span> : null}
          <span className="text-prime">{p}</span>
          {e > 1 ? (
            <sup className="text-factor" style={{ fontSize: 'var(--fs--2)' }}>
              {e}
            </sup>
          ) : null}
        </span>
      ))}
    </span>
  )
}
