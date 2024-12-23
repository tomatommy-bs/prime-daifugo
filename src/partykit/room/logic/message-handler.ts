import assert from 'node:assert/strict'
import { ROOM_STATUS } from '@/constants/status'
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
    ServerMessenger.broadcastSystemEvent({
      room,
      content: { action: 'game-start' },
    })
    ServerMessenger.broadcastRoomStatus({ room, status: ROOM_STATUS.playing })
  },

  onDraw: (_room, sender) => {
    assert(sender.state)
  },
})
