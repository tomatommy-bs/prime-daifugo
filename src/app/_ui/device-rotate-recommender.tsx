'use client'

import { useShouldRotate } from '@/hooks/use-should-rotate'
import { Affix, Checkbox, CloseButton, Group, Paper, Stack, Text } from '@mantine/core'
import { useSessionStorage } from '@mantine/hooks'
import { IconDeviceMobileRotated } from '@tabler/icons-react'
import { useEffect, useState } from 'react'

/**
 * Dismissible top banner recommending landscape play on portrait phones (spec §7.6).
 * Honours the per-tab sessionStorage key `shouldShowRotateRecommender`.
 */
const DeviceRotateRecommender: React.FC = () => {
  const { shouldRotate } = useShouldRotate({})

  const [shouldShow, setShouldShow] = useSessionStorage({
    key: 'shouldShowRotateRecommender',
    defaultValue: true,
  })
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Re-arm the banner whenever the device leaves the "should rotate" state.
  useEffect(() => {
    if (!shouldRotate) {
      setDismissed(false)
    }
  }, [shouldRotate])

  const handleClose = () => {
    if (dontShowAgain) {
      setShouldShow(false)
    }
    setDismissed(true)
  }

  if (!(shouldShow && shouldRotate) || dismissed) {
    return null
  }

  return (
    <Affix
      position={{ top: 'var(--sp-3)', left: 'var(--sp-3)', right: 'var(--sp-3)' }}
      zIndex={150}
    >
      <Paper
        role="dialog"
        aria-label="画面の向き"
        withBorder={true}
        radius="lg"
        p="md"
        mx="auto"
        maw={377}
        style={{
          background: 'var(--surface-raised)',
          color: 'var(--ink)',
          boxShadow: 'var(--shadow-2)',
          borderLeft: '3px solid var(--mod)',
        }}
      >
        <Group align="flex-start" wrap="nowrap" gap="md">
          <IconDeviceMobileRotated
            aria-hidden={true}
            stroke={1.5}
            size={32}
            style={{ color: 'var(--mod)', flexShrink: 0 }}
          />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text fw={700}>横向きにしてプレイ</Text>
            <Text size="sm" c="var(--ink-muted)">
              スマートフォンは横向きのほうが手札と場を広く表示できます。
            </Text>
            <Checkbox
              size="sm"
              label="再度ページを開くまで表示しない"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.currentTarget.checked)}
            />
          </Stack>
          <CloseButton aria-label="閉じる" size="lg" onClick={handleClose} />
        </Group>
      </Paper>
    </Affix>
  )
}

export default DeviceRotateRecommender
