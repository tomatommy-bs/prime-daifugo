import { type SubmitCardSet, clientToServerSchema } from '@/interface/client-to-server'
import type { ConnectionState } from '@/interface/connection'
import type * as Party from 'partykit/server'

interface Event {
  onChat?: (room: Party.Room, message: string, sender: Party.Connection<ConnectionState>) => void
  onSetName?: (room: Party.Room, name: string, sender: Party.Connection<ConnectionState>) => void
  onSetReady?: (room: Party.Room, sender: Party.Connection<ConnectionState>) => void
  onUnsetReady?: (room: Party.Room, sender: Party.Connection<ConnectionState>) => void
  onStartGame?: (room: Party.Room, sender: Party.Connection<ConnectionState>) => void
  onDraw?: (room: Party.Room, sender: Party.Connection<ConnectionState>) => void
  onPass?: (room: Party.Room, sender: Party.Connection<ConnectionState>) => void
  onSubmit?: (
    room: Party.Room,
    sender: Party.Connection<ConnectionState>,
    submitCardSet: SubmitCardSet,
  ) => void
}

export class MessageManager {
  onChat?: Event['onChat']
  onSetName?: Event['onSetName']
  onSetReady?: Event['onSetReady']
  onUnsetReady?: Event['onUnsetReady']
  onStartGame?: Event['onStartGame']
  onDraw?: Event['onDraw']
  onPass?: Event['onPass']
  onSubmit?: Event['onSubmit']

  constructor(args: Event) {
    this.onChat = args.onChat
    this.onSetName = args.onSetName
    this.onSetReady = args.onSetReady
    this.onUnsetReady = args.onUnsetReady
    this.onStartGame = args.onStartGame
    this.onDraw = args.onDraw
    this.onPass = args.onPass
    this.onSubmit = args.onSubmit
  }

  onMessage(room: Party.Room, payload: string, sender: Party.Connection<ConnectionState>) {
    const msg = clientToServerSchema.parse(JSON.parse(payload))

    switch (msg.event) {
      case 'chat':
        this.onChat?.(room, msg.message, sender)
        break
      case 'room':
        switch (msg.action) {
          case 'set-ready':
            this.onSetReady?.(room, sender)
            break
          case 'unset-ready':
            this.onUnsetReady?.(room, sender)
            break
          case 'start-game':
            this.onStartGame?.(room, sender)
            break
          default:
            throw new Error(msg satisfies never)
        }
        break
      case 'set-name': {
        this.onSetName?.(room, msg.name, sender)
        break
      }
      case 'game': {
        switch (msg.action) {
          case 'draw':
            this.onDraw?.(room, sender)
            break
          case 'pass':
            this.onPass?.(room, sender)
            break
          case 'submit':
            this.onSubmit?.(room, sender, msg.submitCardSet)
            break
          default:
            throw new Error(msg satisfies never)
        }
        break
      }
      default:
        throw new Error(msg satisfies never)
    }
  }
}
