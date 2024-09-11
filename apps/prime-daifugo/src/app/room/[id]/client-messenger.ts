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
}
