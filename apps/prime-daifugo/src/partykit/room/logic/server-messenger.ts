import type * as Party from "partykit/server";
import * as serverToClient from "@/interface/server-to-client";

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

  static broadcastPresence(args: {
    room: Party.Room;
    connections: { id: string; name: string }[];
  }) {
    const { room, connections } = args;
    const payload: serverToClient.PresenceEvent = {
      event: "presence",
      presence: connections,
    };
    room.broadcast(JSON.stringify(payload));
  }
}
