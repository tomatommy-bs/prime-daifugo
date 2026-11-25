'use client'

import { SieveGrid } from '@/design/SieveGrid'
import { IconTherefore } from '@/design/icons'
import { Button } from '@mantine/core'
import { IconHome, IconRotateClockwise } from '@tabler/icons-react'
import Link from 'next/link'

type Props = {
  error: Error & { digest?: string }
  reset?: () => void
}

/** Error boundary for `/room/new` (§7.3): retry the server fetch or go home. */
export default function RoomNewError(_props: Props) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-fib-4">
      <section
        role="alert"
        aria-labelledby="room-new-error-title"
        className="flex w-full max-w-[377px] flex-col items-center gap-fib-4 rounded-[var(--r-3)] p-fib-5 text-center"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-2)' }}
      >
        <SieveGrid n={30} cols={10} size={14} primeOpacity={0.25} className="opacity-70" />
        <h1
          id="room-new-error-title"
          className="m-0 flex items-center gap-fib-2 font-bold"
          style={{ fontSize: 'var(--fs-1)', lineHeight: 1.236 }}
        >
          部屋を作れませんでした
          <IconTherefore style={{ color: 'var(--danger)' }} />
        </h1>
        <p className="m-0 text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
          通信に失敗したか、サーバーが混み合っています。
        </p>
        <div className="grid w-full grid-cols-2 gap-fib-3">
          {/* A full navigation, so the server fetch really runs again. */}
          <Button
            component="a"
            href="/room/new"
            leftSection={<IconRotateClockwise stroke={1.5} size="1.25em" />}
          >
            もう一度
          </Button>
          <Button
            component={Link}
            href="/"
            variant="default"
            leftSection={<IconHome stroke={1.5} size="1.25em" />}
          >
            ホームへ
          </Button>
        </div>
      </section>
    </main>
  )
}
