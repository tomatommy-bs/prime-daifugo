import type * as Party from "partykit/server";
import { MessageManager } from "./message-manager";
import * as serverToClient from "../../../interface/server-to-client";

export class MessageHandler {
  messageManager: MessageManager;
  constructor(args: { room: Party.Room }) {
    const messageManager = new MessageManager(args.room, {
      onChat: (message, sender) => {
        const payload = handleChat(message, sender);
        args.room.broadcast(JSON.stringify(payload), [sender.id]);
      },
    });
    this.messageManager = messageManager;
  }

  onMessage(payload: string, sender: Party.Connection) {
    this.messageManager.onMessage(payload, sender);
  }
}

function handleChat(
  message: string,
  sender: Party.Connection
): serverToClient.ChatEvent {
  return {
    event: "chat",
    message: message,
  };
}
