import * as clientToServer from "@/interface/client-to-server";
import PartySocket from "partysocket";

export class ClientMessenger {
  static sendMessage(args: { ws: PartySocket; message: string }) {
    const { ws, message } = args;
    const payload: clientToServer.ChatEvent = {
      event: "chat",
      message: message,
    };
    ws.send(JSON.stringify(payload));
  }

  static setReady(args: { ws: PartySocket }) {
    const { ws } = args;
    const payload: clientToServer.RoomEvent = {
      event: "room",
      action: "set-ready",
    };
    ws.send(JSON.stringify(payload));
  }

  static unsetReady(args: { ws: PartySocket }) {
    const { ws } = args;
    const payload: clientToServer.RoomEvent = {
      event: "room",
      action: "unset-ready",
    };
    ws.send(JSON.stringify(payload));
  }

  static startGame(args: { ws: PartySocket }) {
    const { ws } = args;
    const payload: clientToServer.RoomEvent = {
      event: "room",
      action: "start-game",
    };
    ws.send(JSON.stringify(payload));
  }
}
