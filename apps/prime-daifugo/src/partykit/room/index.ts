import * as Party from "partykit/server";
import * as serverToClient from "../../interface/server-to-client";
import { MessageManager } from "./logic/message-manager";
import { messageHandler } from "./logic/message-handler";
import { ServerMessenger } from "./logic";
import { ConnectionState } from "@/interface/connection";
import { ROOM_STATUS } from "@/constants/status";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request): Promise<Response> {
    switch (req.method) {
      case "GET": {
        const roomStatus = await this.room.storage.get("roomStatus");
        const body = { roomStatus };
        const payload = JSON.stringify(body);
        return new Response(payload, { status: 200 });
      }
      default:
        return new Response("method not allowed", { status: 405 });
    }
  }

  onConnect(
    conn: Party.Connection<ConnectionState>,
    ctx: Party.ConnectionContext
  ) {
    conn.setState({ status: "not-ready", name: conn.id });
    ServerMessenger.broadcastMessage({
      room: this.room,
      message: `connection ${conn.id} joined the room`,
      from: "__system__",
    });
    ServerMessenger.broadcastPresence({
      room: this.room,
    });
  }

  onMessage(payload: string, sender: Party.Connection<ConnectionState>) {
    messageHandler.onMessage(this.room, payload, sender);
  }

  onClose(connection: Party.Connection): void | Promise<void> {
    ServerMessenger.broadcastMessage({
      room: this.room,
      message: `connection ${connection.id} left the room`,
      from: "__system__",
    });
    const connections = Array.from(this.room.getConnections<ConnectionState>());
    ServerMessenger.broadcastPresence({
      room: this.room,
    });

    if (connections.length === 0) this.initialize();
  }

  onStart(): void | Promise<void> {
    console.log(`room ${this.room.id} started`);
  }

  onAlarm(): void | Promise<void> {
    console.log(`room  alarmed`);
  }

  private initialize() {
    this.room.storage.deleteAlarm();
    this.room.storage.deleteAll();
    this.room.storage.put("roomStatus", ROOM_STATUS.waiting);
    console.log(`room ${this.room.id} initialized`);
  }
}

Server satisfies Party.Worker;
