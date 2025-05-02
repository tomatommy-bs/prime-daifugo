import { ActionIcon, CopyButton, Flex, Popover, TextInput, Tooltip } from '@mantine/core'
import { IconCheck, IconCopy, IconQrcode } from '@tabler/icons-react'
import QRCode from 'react-qr-code'

type Props = {
  url: string
}

const QRButton: React.FC<Props> = ({ url }) => {
  return (
    <Popover>
      <Popover.Target>
        <ActionIcon variant="white">
          <IconQrcode />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <QRCode value={url} />
        <Flex className="mt-4 items-center justify-center gap-2">
          <TextInput className="grow" readOnly={true} value={url} />
          <CopyButton value={url} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow={true} position="right">
                <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Flex>
      </Popover.Dropdown>
    </Popover>
  )
}

export { QRButton }
