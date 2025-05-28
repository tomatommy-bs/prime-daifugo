import { GAME_CONFIG } from '@/constants/config'
import type { PrimeDaifugoSetupData } from '@/interface/common'
import type * as serverToClient from '@/interface/server-to-client'
import {
  Badge,
  Button,
  Fieldset,
  Group,
  InputDescription,
  InputLabel,
  InputWrapper,
  Paper,
  SegmentedControl,
  Stack,
} from '@mantine/core'
import { useSetState } from '@mantine/hooks'
import ClientRoomManager from '../room-manager'

interface Props {
  presence: serverToClient.PresenceEvent['presence']
  myPresence?: serverToClient.PresenceEvent['presence'][number]
  onGameStart?: (args: PrimeDaifugoSetupData) => void
  onSetReady?: () => void
  onUnsetReady?: () => void
}

export const WaitingRoom: React.FC<Props> = (props) => {
  const [rule, setRule] = useSetState<PrimeDaifugoSetupData>({
    initNumCards: GAME_CONFIG.initialNumCards as number,
    timeLimit: GAME_CONFIG.timeLimit as number,
    maxSubmitNumCards: GAME_CONFIG.maxSubmitNumCards as number,
    halfEvenNumbers: false,
  })

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
        <Button onClick={() => onGameStart?.(rule)} disabled={!canStartGame}>
          start game
        </Button>
      </Group>
      <Fieldset legend={<Badge variant="default">Game Rule</Badge>}>
        <InputWrapper className="grid grid-cols-12 my-1 items-center">
          <InputLabel className="col-span-3">制限時間</InputLabel>
          <SegmentedControl
            className="col-span-9"
            size="xs"
            value={rule.timeLimit?.toString()}
            onChange={(value) => setRule({ timeLimit: Number(value) })}
            data={[
              { label: '15 秒', value: '15' },
              { label: '60 秒', value: '60' },
              { label: '300 秒', value: '300' },
            ]}
          />
        </InputWrapper>
        <InputWrapper className="grid grid-cols-12 my-1 items-center">
          <InputLabel className="col-span-3">初期手札枚数</InputLabel>
          <SegmentedControl
            className="col-span-9"
            size="xs"
            value={rule.initNumCards?.toString()}
            onChange={(value) => setRule({ initNumCards: Number(value) })}
            data={[
              { label: '4 枚', value: '4' },
              { label: '8 枚', value: '8' },
              { label: '11 枚', value: '11' },
            ]}
          />
        </InputWrapper>
        <InputWrapper className="grid grid-cols-12 my-1 items-center">
          <InputLabel className="col-span-3">最大提出枚数</InputLabel>
          <SegmentedControl
            className="col-span-9"
            size="xs"
            value={rule.maxSubmitNumCards?.toString()}
            onChange={(value) => setRule({ maxSubmitNumCards: Number(value) })}
            data={[
              { label: '4 枚', value: '4' },
              { label: '∞ 枚', value: '52' },
            ]}
          />
        </InputWrapper>

        <InputWrapper className="grid grid-cols-12 my-1 items-center">
          <InputLabel className="col-span-3">
            偶数半減
            <InputDescription>山札の偶数の枚数を半分にします</InputDescription>
          </InputLabel>
          <SegmentedControl
            className="col-span-9"
            size="xs"
            value={rule.halfEvenNumbers ? 'on' : 'off'}
            onChange={(value) => setRule({ halfEvenNumbers: value === 'on' })}
            data={[
              { label: 'ON', value: 'on' },
              { label: 'OFF', value: 'off' },
            ]}
          />
        </InputWrapper>
      </Fieldset>
    </Stack>
  )
}
