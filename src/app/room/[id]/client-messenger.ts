import type * as clientToServer from '@/interface/client-to-server'
import type { PrimeDaifugoSetupData } from '@/interface/common'

import type PartySocket from 'partysocket'

export class ClientMessenger {
  static sendMessage(args: { ws: PartySocket; message: string }) {
    const { ws, message } = args
    const payload: clientToServer.ChatEvent = {
      event: 'chat',
      message: message,
    }
    ws.send(JSON.stringify(payload))
  }

  static setReady(args: { ws: PartySocket }) {
    const { ws } = args
    const payload: clientToServer.RoomEvent = {
      event: 'room',
      action: 'set-ready',
    }
    ws.send(JSON.stringify(payload))
  }

  static unsetReady(args: { ws: PartySocket }) {
    const { ws } = args
    const payload: clientToServer.RoomEvent = {
      event: 'room',
      action: 'unset-ready',
    }
    ws.send(JSON.stringify(payload))
  }

  static changeRule(args: { ws: PartySocket; rule: Partial<PrimeDaifugoSetupData> }) {
    const { ws, rule } = args
    const payload: clientToServer.RoomEvent = {
      event: 'room',
      action: 'change-rule',
      rule: rule,
    }
    ws.send(JSON.stringify(payload))
  }

  static startGame(args: { ws: PartySocket; rule?: PrimeDaifugoSetupData }) {
    const { ws } = args
    const payload: clientToServer.RoomEvent = {
      event: 'room',
      action: 'start-game',
      rule: args.rule,
    }
    ws.send(JSON.stringify(payload))
  }

  static sendName(args: { ws: PartySocket; name: string }) {
    const { ws, name } = args
    const payload: clientToServer.SetNameEvent = {
      event: 'set-name',
      name: name,
    }
    ws.send(JSON.stringify(payload))
  }

  static draw(args: { ws: PartySocket }) {
    const { ws } = args
    const payload: clientToServer.GameEvent = {
      event: 'game',
      action: 'draw',
    }
    ws.send(JSON.stringify(payload))
  }

  static pass(args: { ws: PartySocket }) {
    const { ws } = args
    const payload: clientToServer.GameEvent = {
      event: 'game',
      action: 'pass',
    }
    ws.send(JSON.stringify(payload))
  }

  static submit(args: { ws: PartySocket; submitCardSet: clientToServer.SubmitCardSet }) {
    const { ws, submitCardSet } = args
    const payload: clientToServer.GameEvent = {
      event: 'game',
      action: 'submit',
      submitCardSet,
    }
    ws.send(JSON.stringify(payload))
  }
}
