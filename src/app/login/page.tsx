'use client'

import { IconQed } from '@/design/icons'
import { Button, CloseButton, Paper, TextInput } from '@mantine/core'
import { useInputState } from '@mantine/hooks'
import { IconArrowRight } from '@tabler/icons-react'
import Cookies from 'js-cookie'
import { useRouter, useSearchParams } from 'next/navigation'
import type { FormEvent } from 'react'
import { NameLengthMeter } from './name-length-meter'

const MIN_LENGTH = 3
const MAX_LENGTH = 10

export default function Page() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [name, setName] = useInputState(Cookies.get('name') || '')
  const isValid = name.length >= MIN_LENGTH && name.length <= MAX_LENGTH

  // Behaviour kept verbatim from the previous page (§0.3): cookie `name` for 365 days, then
  // `location.pathname = callback` or `router.push('/')`. Enter submits through the form.
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isValid) {
      return
    }
    Cookies.set('name', name, { expires: 365 })
    const callback = searchParams.get('callback')
    if (typeof callback === 'string') {
      // CHECK: router.push() では, middleware の cache 処理によりすでに `/room/[id]` からリダイレクトされているため, ページ遷移が行われない
      location.pathname = callback
    } else {
      router.push('/')
    }
  }

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit}
      noValidate={true}
      aria-labelledby="login-title"
      className="relative w-full max-w-[377px]"
      p="xl"
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-3)',
        boxShadow: 'var(--shadow-2)',
        border: '1px solid var(--line)',
      }}
    >
      <h1
        id="login-title"
        className="m-0 flex items-center gap-fib-2 font-bold leading-[1.236]"
        style={{ fontSize: 'var(--fs-2)' }}
      >
        <IconQed style={{ color: 'var(--prime)', fontSize: '0.8em' }} />
        素数大富豪
      </h1>
      <p className="mt-fib-1 mb-fib-4 text-ink-muted" style={{ fontSize: 'var(--fs-0)' }}>
        名前を入力してください
      </p>

      <TextInput
        label="名前"
        name="name"
        autoComplete="nickname"
        value={name}
        onChange={setName}
        size="md"
        rightSectionPointerEvents="all"
        rightSection={
          name.length > 0 ? (
            <CloseButton aria-label="クリア" onClick={() => setName('')} size="md" />
          ) : null
        }
        styles={{
          input: { minHeight: 44 },
          label: { fontWeight: 600, marginBottom: 'var(--sp-1)' },
        }}
      />

      <NameLengthMeter
        className="mt-fib-3"
        length={name.length}
        min={MIN_LENGTH}
        max={MAX_LENGTH}
      />

      <Button
        type="submit"
        fullWidth={true}
        size="md"
        mt="xl"
        h={55}
        disabled={!isValid}
        rightSection={<IconArrowRight stroke={1.5} size="1.25em" />}
      >
        はじめる
      </Button>
    </Paper>
  )
}
