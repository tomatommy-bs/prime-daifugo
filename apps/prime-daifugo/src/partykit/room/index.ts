import type * as Party from "partykit/server";
import * as serverToClient from "../../interface/server-to-client";
import { MessageManager } from "./logic/message-manager";
import { messageHandler } from "./logic/message-handler";
import { ServerMessenger } from "./logic";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    ServerMessenger.broadcastMessage({
      room: this.room,
      message: `connection ${conn.id} joined the room`,
      from: "__system__",
    });
    ServerMessenger.broadcastPresence({
      room: this.room,
      connections: Array.from(this.room.getConnections()).map((conn) => ({
        id: conn.id,
        name: conn.id,
      })),
    });
  }

  onMessage(payload: string, sender: Party.Connection) {
    messageHandler.onMessage(this.room, payload, sender);
  }

  onClose(connection: Party.Connection): void | Promise<void> {
    ServerMessenger.broadcastMessage({
      room: this.room,
      message: `connection ${connection.id} left the room`,
      from: "__system__",
    });
    const connections = Array.from(this.room.getConnections());
    ServerMessenger.broadcastPresence({
      room: this.room,
      connections: connections.map((conn) => ({
        id: conn.id,
        name: conn.id,
      })),
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

    console.log(`room ${this.room.id} initialized`);
  }
}

Server satisfies Party.Worker;
