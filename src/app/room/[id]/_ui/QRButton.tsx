'use client'
/**
 * Room invite: a QR popover with the URL and a copy button (§6.4). Same props as before;
 * `popoverProps.defaultOpened` is honoured. When it starts closed (phones), the trigger
 * pulses once so the invite is still discoverable. The QR stays black on white, like the
 * cards, so it scans in both colour schemes.
 */
import { DUR, EASE, useMotionMode } from '@/design/motion'
import {
  ActionIcon,
  CopyButton,
  Popover,
  type PopoverProps,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { IconCheck, IconCopy, IconQrcode } from '@tabler/icons-react'
import { m } from 'framer-motion'
import QRCode from 'react-qr-code'

type Props = {
  url: string
  popoverProps?: PopoverProps
}

const QRButton: React.FC<Props> = ({ url, popoverProps }) => {
  const motion = useMotionMode()
  const pulse = popoverProps?.defaultOpened !== true && motion === 'full'
  return (
    <Popover
      position="bottom-start"
      withArrow={true}
      shadow="md"
      hideDetached={false}
      {...popoverProps}
    >
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size={44}
          aria-label="招待用QRコード"
          className="relative text-ink"
          data-motion={motion}
        >
          {pulse ? (
            <m.span
              aria-hidden="true"
              data-pulse=""
              className="pointer-events-none absolute inset-1 rounded-[var(--r-2)] ring-2 ring-mod"
              initial={{ opacity: 0.9, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.35 }}
              transition={{ duration: DUR.xl, ease: EASE.out, delay: DUR.lg }}
            />
          ) : null}
          <IconQrcode size="1.25em" stroke={1.5} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown className="!border-line !bg-surface p-fib-3">
        <div className="flex w-[233px] flex-col gap-fib-3">
          <div className="rounded-[var(--r-2)] bg-[var(--card-face)] p-fib-3 ring-1 ring-line">
            <QRCode
              value={url}
              size={209}
              fgColor="#15171C"
              bgColor="#FFFFFF"
              style={{ width: '100%', height: 'auto', display: 'block' }}
              aria-hidden="true"
            />
          </div>
          <div className="flex items-center gap-fib-2">
            <TextInput
              className="min-w-0 grow"
              classNames={{ input: 'num text-[length:var(--fs--1)]' }}
              readOnly={true}
              value={url}
              aria-label="招待URL"
              onFocus={(e) => e.currentTarget.select()}
            />
            <CopyButton value={url} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'コピーしました' : 'コピー'} position="right">
                  <ActionIcon
                    color={copied ? 'factor' : 'gray'}
                    variant={copied ? 'light' : 'subtle'}
                    size={44}
                    onClick={copy}
                    aria-label={copied ? 'コピーしました' : 'URLをコピー'}
                  >
                    {copied ? (
                      <IconCheck size="1.25em" stroke={1.5} />
                    ) : (
                      <IconCopy size="1.25em" stroke={1.5} />
                    )}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}

export { QRButton }
