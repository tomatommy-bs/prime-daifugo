// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import assert from 'assert'
import { GAME_CONFIG } from '@/constants/config'
import { ROOM_STATUS } from '@/constants/status'
import type { PrimeDaifugoSetupData } from '@/interface/common'
import type { ConnectionState } from '@/interface/connection'
import type * as Party from 'partykit/server'
import { type Ctx, type Game, INVALID_MOVE, PLAYER_STATE, PrimeDaifugoGame } from './game-rule'
import { GameParty } from './game-rule/game-party'
import type { PrimeDaifugoGameState } from './game-rule/game-state'
import { MessageManager } from './message-manager'
import { ServerMessenger } from './server-messenger'

export const messageHandler = new MessageManager({
  onChat: (room, message, sender) => {
    ServerMessenger.broadcastMessage({
      room,
      message: message,
      from: sender.id,
    })
  },

  onSetName: (room, name, sender) => {
    assert(sender.state)
    sender.setState({ ...sender.state, name: name })
    ServerMessenger.broadcastPresence({ room })
  },

  onSetReady: (room, sender) => {
    assert(sender.state)
    sender.setState({ ...sender.state, status: 'ready' })
    ServerMessenger.broadcastPresence({ room })
  },

  onUnsetReady: (room, sender) => {
    assert(sender.state)
    sender.setState({ ...sender.state, status: 'not-ready' })
    ServerMessenger.broadcastPresence({ room })
  },

  onStartGame: async (room, sender, rule) => {
    assert(sender.state)
    await room.storage.put('roomStatus', ROOM_STATUS.playing)
    const party = new GameParty<Game<PrimeDaifugoGameState, PrimeDaifugoSetupData>>({
      game: PrimeDaifugoGame,
      players: Array.from(room.getConnections<ConnectionState>()).map((conn) => ({
        id: conn.id,
        state: conn.state?.status === 'ready' ? PLAYER_STATE.PLAY : PLAYER_STATE.OBSERVE,
      })),
      setupData: rule,
    })

    await room.storage.put('gameState', party.getState())
    await room.storage.put('gameCtx', party.ctx)
    ServerMessenger.broadcastSystemEvent({
      room,
      content: {
        event: 'system',
        action: 'game-start',
        gameState: party.getState(),
        ctx: party.ctx,
        commander: {
          id: sender.id,
          name: sender.state.name,
        },
      },
    })
    ServerMessenger.broadcastRoomStatus({ room, status: ROOM_STATUS.playing })
    room.storage.put('leftTime', rule?.timeLimit ?? GAME_CONFIG.timeLimit)
    room.storage.setAlarm(Date.now() + 1 * 1000)
    ServerMessenger.broadcastLeftTime({
      room,
      leftTime: rule?.timeLimit ?? GAME_CONFIG.timeLimit,
    })
  },

  onDraw: async (room, sender) => {
    partyStorageMiddleware(room, sender, (party) => {
      assert(sender.state)
      party.moves.draw(sender.id)
      party.ctx
      ServerMessenger.broadcastSystemEvent({
        room,
        content: {
          event: 'system',
          action: 'draw',
          gameState: party.getState(),
          ctx: party.ctx,
          commander: {
            id: sender.id,
            name: sender.state.name,
          },
        },
      })
    })
  },

  onPass: async (room, sender) => {
    // biome-ignore lint/suspicious/useAwait: <explanation>
    partyStorageMiddleware(room, sender, async (party) => {
      assert(sender.state)
      party.moves.pass(sender.id)
      ServerMessenger.broadcastSystemEvent({
        room,
        content: {
          event: 'system',
          action: 'pass',
          gameState: party.getState(),
          ctx: party.ctx,
          commander: {
            id: sender.id,
            name: sender.state.name,
          },
        },
      })

      room.storage.setAlarm(Date.now() + 1 * 1000)
      const rule = (await room.storage.get<PrimeDaifugoGameState>('gameState'))?.rule
      const timeLimit = rule?.timeLimit ?? GAME_CONFIG.timeLimit

      room.storage.put('leftTime', timeLimit)
      ServerMessenger.broadcastLeftTime({
        room,
        leftTime: timeLimit,
      })
    })
  },

  onSubmit: async (room, sender, submitCardSet) => {
    // biome-ignore lint/suspicious/useAwait: <explanation>
    partyStorageMiddleware(room, sender, async (party) => {
      assert(sender.state)
      if (party.moves.submit(sender.id, submitCardSet) === INVALID_MOVE) {
        return
      }

      ServerMessenger.broadcastSystemEvent({
        room,
        content: {
          event: 'system',
          action: 'submit',
          gameState: party.getState(),
          ctx: party.ctx,
          commander: {
            id: sender.id,
            name: sender.state.name,
          },
          submissionResult: {
            submitCardSet: submitCardSet,
            result: party.getState().lastSubmitError,
          },
        },
      })

      const rule = (await room.storage.get<PrimeDaifugoGameState>('gameState'))?.rule
      const timeLimit = rule?.timeLimit ?? GAME_CONFIG.timeLimit
      room.storage.put('leftTime', timeLimit)
      if (party.getState().field.length > 0) {
        room.storage.setAlarm(Date.now() + 1 * 1000)
        ServerMessenger.broadcastLeftTime({
          room,
          leftTime: timeLimit,
        })
      } else {
        room.storage.deleteAlarm()
      }
    })
  },
})

const partyStorageMiddleware = async (
  room: Party.Room,
  sender: Party.Connection<ConnectionState>,
  callback: (party: GameParty<Game<PrimeDaifugoGameState>>) => void,
) => {
  const gameState = await room.storage.get<PrimeDaifugoGameState>('gameState')
  const gameCtx = await room.storage.get<Ctx>('gameCtx')
  assert(gameState)
  assert(gameCtx)

  const party = new GameParty({
    game: PrimeDaifugoGame,
    activePlayers: gameCtx.activePlayers,
    currentPlayer: gameCtx.currentPlayer,
    playOrder: gameCtx.playOrder,
    state: gameState,
    onEnd: (_ctx, state) => {
      assert(sender.state)
      const winner = state.deckTopPlayer
      const winnerName = room.getConnection<ConnectionState>(winner ?? '')?.state?.name
      if (winnerName == null) {
        throw new Error('winner is null')
      }

      ServerMessenger.broadcastSystemEvent({
        room,
        content: {
          event: 'system',
          action: 'game-end',
          commander: {
            id: sender.id,
            name: sender.state.name,
          },
          gameState: state,
          ctx: gameCtx,
          winner: winnerName,
        },
      })
      ServerMessenger.broadcastRoomStatus({ room, status: ROOM_STATUS.waitingNextRound })
    },
  })

  callback(party)

  await room.storage.put('gameState', party.getState())
  await room.storage.put('gameCtx', party.ctx)
}
