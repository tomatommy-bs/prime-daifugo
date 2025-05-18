import type * as serverToClient from '@/interface/server-to-client'
import { Badge, Button, Group, Paper, Stack } from '@mantine/core'
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
    <Stack>
      <Group>
        {presence.map(({ id, name, status }) => (
          <Paper key={id} p="xs" style={{ width: 200 }}>
            <Group justify="space-between">
              {name}
              {status === 'ready' ? <Badge>ready</Badge> : null}
            </Group>
          </Paper>
        ))}

        {myPresence?.status === 'ready' ? (
          <Button variant="white" onClick={onUnsetReady}>
            unready
          </Button>
        ) : (
          <Button onClick={onSetReady}>ready</Button>
        )}
        <Button onClick={onGameStart} disabled={!canStartGame}>
          start game
        </Button>
      </Group>
      {/* <Fieldset legend={<Badge variant="default">Game Rule : coming soon</Badge>} disabled={true}>
        <InputWrapper label="initial card number">
          <NumberInput value={8} readOnly={true} />
        </InputWrapper>
        <InputWrapper label="time limit">
          <NumberInput value={60} />
        </InputWrapper>
        <InputWrapper label="Grothendieck cut">
          <Switch checked={true} label="enabled" />
        </InputWrapper>
        <InputWrapper label="Ramanujan Revolution">
          <Switch checked={false} label="disabled" />
        </InputWrapper>
        <InputWrapper label="half even numbers">
          <InputDescription>
            If it's enabled, the number of the even cards will be halved.
          </InputDescription>
          <Switch checked={false} label="disabled" />
        </InputWrapper>
      </Fieldset> */}
    </Stack>
  )
}
