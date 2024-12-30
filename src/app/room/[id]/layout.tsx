'use client'

import { useShouldDevice } from '@/hooks/use-should-device'
import { Affix, Burger, Container, Menu } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconHome, IconMaximize, IconMinimize } from '@tabler/icons-react'
import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { canFullscreen, shouldFullscreen, toggleFullscreen } = useShouldDevice({})
  const [burgerOpened, burgerHandler] = useDisclosure()

  return (
    <section>
      <Container>
        <main>{children}</main>
        <footer>
          <Affix className="m-4" position={{ right: 0, top: 0 }}>
            <Menu opened={burgerOpened} onClose={burgerHandler.close}>
              <Menu.Target>
                <Burger opened={burgerOpened} onClick={burgerHandler.toggle} />
              </Menu.Target>
              <Menu.Dropdown>
                <Link href="/">
                  <Menu.Item leftSection={<IconHome />}>Home</Menu.Item>
                </Link>
                {canFullscreen && (
                  <Menu.Item
                    leftSection={shouldFullscreen ? <IconMaximize /> : <IconMinimize />}
                    onClick={toggleFullscreen}
                  >
                    Fullscreen
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Affix>
        </footer>
      </Container>
    </section>
  )
}
