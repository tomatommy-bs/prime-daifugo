'use client'

import { IconSunMoon } from '@/design/icons'
import { useShouldDevice } from '@/hooks/use-should-device'
import { Affix, Burger, Menu, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { IconHome, IconMaximize, IconMinimize } from '@tabler/icons-react'
import Link from 'next/link'
import { type FC, useEffect, useState } from 'react'

export type NavBurgerProps = {
  /** `affix` pins it to the top-right corner (default); `inline` renders it in place, e.g. in a header. */
  placement?: 'affix' | 'inline'
}

/** Below Mantine modals and overlays (200), above page content. */
export const NAV_BURGER_Z_INDEX = 150

const ICON = { stroke: 1.5, size: '1.25em' } as const

/** Whether the document is in fullscreen right now, tracked through `fullscreenchange`. */
export function useIsFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement))
    update()
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  return fullscreen
}

const NavBurger: FC<NavBurgerProps> = ({ placement = 'affix' }) => {
  const { canFullscreen, toggleFullscreen } = useShouldDevice({})
  const isFullscreen = useIsFullscreen()
  const [burgerOpened, setBurgerOpened] = useState(false)
  const { setColorScheme } = useMantineColorScheme()
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true })
  const nextScheme = computed === 'dark' ? 'light' : 'dark'

  const menu = (
    <Menu
      opened={burgerOpened}
      onChange={setBurgerOpened}
      position="bottom-end"
      offset={4}
      width={200}
      // The target is pinned (affix) or lives in a fixed header, so it is never scrolled away.
      hideDetached={false}
    >
      <Menu.Target>
        <Burger
          opened={burgerOpened}
          aria-label={burgerOpened ? 'メニューを閉じる' : 'メニューを開く'}
          size="sm"
          // In the phone layouts the board's top bar is 36px tall: the burger sits inside it,
          // and an invisible ::after keeps the hit area 44×44 (it hangs 8px below the bar).
          className="relative flex h-[44px] w-[44px] items-center justify-center rounded-[var(--r-2)] after:absolute after:inset-x-0 after:top-0 after:h-[44px] after:content-[''] compact:h-[36px] portrait-phone:h-[36px]"
          style={{
            background: placement === 'affix' ? 'var(--surface)' : undefined,
            boxShadow: placement === 'affix' ? 'var(--shadow-1)' : undefined,
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} href="/" leftSection={<IconHome {...ICON} />}>
          ホーム
        </Menu.Item>
        {canFullscreen && (
          <Menu.Item
            data-fullscreen={isFullscreen ? 'on' : 'off'}
            // The icon shows what the item does: enter (maximize) or leave (minimize).
            leftSection={isFullscreen ? <IconMinimize {...ICON} /> : <IconMaximize {...ICON} />}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? '全画面を終了' : '全画面'}
          </Menu.Item>
        )}
        <Menu.Item
          data-scheme={computed}
          leftSection={<IconSunMoon {...ICON} />}
          onClick={() => setColorScheme(nextScheme)}
        >
          {nextScheme === 'dark' ? 'ダークモード' : 'ライトモード'}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )

  if (placement === 'inline') {
    return (
      <div data-placement="inline" className="inline-flex">
        {menu}
      </div>
    )
  }

  return (
    <Affix
      data-placement="affix"
      className="compact:top-0! portrait-phone:top-0!"
      zIndex={NAV_BURGER_Z_INDEX}
      position={{
        top: 'max(var(--sp-3), env(safe-area-inset-top))',
        right: 'max(var(--sp-3), env(safe-area-inset-right))',
      }}
    >
      {menu}
    </Affix>
  )
}

export { NavBurger }
