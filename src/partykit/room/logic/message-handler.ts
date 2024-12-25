// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import assert from 'assert'
import { ROOM_STATUS } from '@/constants/status'
import { type Ctx, PrimeDaifugoGame } from './game-rule'
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

  onStartGame: async (room, sender) => {
    assert(sender.state)
    await room.storage.put('roomStatus', ROOM_STATUS.playing)
    const party = new GameParty({
      game: PrimeDaifugoGame,
      numPlayers: Array.from(room.getConnections()).length,
    })
    await room.storage.put('gameState', party.getState())
    await room.storage.put('gameCtx', party.ctx)
    ServerMessenger.broadcastSystemEvent({
      room,
      content: { action: 'game-start', gameState: party.getState() },
    })
  },

  onDraw: async (room, sender) => {
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
    })
    party.move.draw('0')
    party.move.pass('0')
    party.move.draw('1')
    party.move.pass('1')
    console.log(party.getState())

    ServerMessenger.broadcastSystemEvent({
      room,
      content: { action: 'draw', gameState: party.getState() },
    })

    await room.storage.put('gameState', party.getState())
    await room.storage.put('gameCtx', party.ctx)
  },
})
