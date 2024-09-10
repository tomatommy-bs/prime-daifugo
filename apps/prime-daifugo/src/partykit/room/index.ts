import type * as Party from "partykit/server";
import * as serverToClient from "../../interface/server-to-client";
import { MessageManager } from "./logic/message-manager";

export default class Server implements Party.Server {
  messageManager: MessageManager;
  constructor(readonly room: Party.Room) {
    this.messageManager = new MessageManager(room, {
      onChat: (message, sender) => {
        const payload: serverToClient.ChatEvent = {
          event: "chat",
          message: message,
        };
        room.broadcast(JSON.stringify(payload), [sender.id]);
      },
    });
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(
      `Connected:
        id: ${conn.id}
        room: ${this.room.id}
        url: ${new URL(ctx.request.url).pathname}`
    );

    const payload: serverToClient.ChatEvent = {
      event: "chat",
      message: `connection ${conn.id} joined the room`,
    };
    this.room.broadcast(JSON.stringify(payload), [conn.id]);
  }

  onMessage(payload: string, sender: Party.Connection) {
    this.messageManager.onMessage(payload, sender);
  }

  onClose(connection: Party.Connection): void | Promise<void> {
    console.log(`connection ${connection.id} disconnected`);

    const payload: serverToClient.ChatEvent = {
      event: "chat",
      message: `connection ${connection.id} left the room`,
    };

    this.room.broadcast(JSON.stringify(payload), [connection.id]);

    const connections = this.room.getConnections();
    if (Array.from(connections).length === 0) this.initialize();
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
