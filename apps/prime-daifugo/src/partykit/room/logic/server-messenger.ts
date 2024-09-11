import type * as Party from "partykit/server";
import * as serverToClient from "@/interface/server-to-client";
import { ConnectionState } from "@/interface/connection";

export class ServerMessenger {
  static broadcastMessage(args: {
    room: Party.Room;
    message: string;
    from: string;
  }) {
    const { room, message, from } = args;
    const payload: serverToClient.ChatEvent = {
      event: "chat",
      message: message,
      from,
    };
    room.broadcast(JSON.stringify(payload));
  }

  static broadcastPresence(args: { room: Party.Room }) {
    const { room } = args;
    const connections = Array.from(room.getConnections<ConnectionState>()).map(
      (conn) => ({
        id: conn.id,
        name: conn.id,
        status: conn.state?.status || "not-ready",
      })
    );
    const payload: serverToClient.PresenceEvent = {
      event: "presence",
      presence: connections,
    };
    room.broadcast(JSON.stringify(payload));
  }
}
