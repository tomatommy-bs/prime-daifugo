'use client'

import { useShouldDevice } from '@/hooks/use-should-device'
import { ActionIcon, Affix, Button, Container, Group } from '@mantine/core'
import { IconMaximize, IconMinimize } from '@tabler/icons-react'
import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { canFullscreen, shouldFullscreen, toggleFullscreen } = useShouldDevice({})

  return (
    <section>
      <Container>
        <main>{children}</main>
        <footer>
          <Affix className="m-4" position={{ right: 0, top: 0 }}>
            <Group>
              {canFullscreen && (
                <ActionIcon onClick={toggleFullscreen}>
                  {shouldFullscreen ? <IconMaximize /> : <IconMinimize />}
                </ActionIcon>
              )}
              <Link href="/">
                <Button>Home</Button>
              </Link>
            </Group>
          </Affix>
        </footer>
      </Container>
    </section>
  )
}
