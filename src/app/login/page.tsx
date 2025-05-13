'use client'

import { ActionIcon, Button, Center, Group, Paper, Text, TextInput } from '@mantine/core'
import { useInputState } from '@mantine/hooks'
import Cookies from 'js-cookie'
import { useRouter, useSearchParams } from 'next/navigation'

export default function Page() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [name, setName] = useInputState(Cookies.get('name') || '')
  const isValid = name.length >= 3 && name.length <= 10

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    Cookies.set('name', name, { expires: 365 })
    const callback = searchParams.get('callback')
    if (typeof callback === 'string') {
      // CHECK: router.push() では, middleware の cache 処理によりすでに `/room/[id]` からリダイレクトされているため, ページ遷移が行われない
      // location.pathname = callback
      router.replace(callback)
    } else {
      router.push('/')
    }
  }

  return (
    <Paper withBorder={true} p={'md'}>
      <Center>
        <Group align="end">
          <ActionIcon variant="white" pb={8}>
            <Text>🗑️</Text>
          </ActionIcon>
          <TextInput label="name" description="3 ~ 10 letters" value={name} onChange={setName} />
          <Button disabled={!isValid} onClick={handleClick}>
            OK
          </Button>
        </Group>
      </Center>
    </Paper>
  )
}
