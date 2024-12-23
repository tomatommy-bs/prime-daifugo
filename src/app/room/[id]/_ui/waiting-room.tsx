import { Button, CheckIcon, CloseIcon, Group, Paper } from '@mantine/core'
import * as serverToClient from '@/interface/server-to-client'
import ClientRoomManager from '../room-manager'

interface Props {
  presence: serverToClient.PresenceEvent['presence']
  myPresence?: serverToClient.PresenceEvent['presence'][number]
  onGameStart?: () => void
  onSetReady?: () => void
  onUnsetReady?: () => void
}

export const WaitingRoom: React.FC<Props> = (props) => {
  const { presence, myPresence, onGameStart, onSetReady, onUnsetReady } = props
  const canStartGame = ClientRoomManager.canStartGame(presence)

  return (
    <Group>
      {presence.map(({ id, name, status }) => (
        <Paper key={id} p="xs" style={{ width: 200 }}>
          <Group justify="space-between">
            {name}
            {status === 'ready' ? <CheckIcon size={'16px'} /> : null}
          </Group>
        </Paper>
      ))}
      {myPresence?.status === 'ready' ? (
        <Button onClick={onUnsetReady}>un ready</Button>
      ) : (
        <Button onClick={onSetReady}>ready</Button>
      )}
      <Button onClick={onGameStart} disabled={!canStartGame}>
        start game
      </Button>
    </Group>
  )
}
