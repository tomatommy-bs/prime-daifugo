import { MessageManager } from "./message-manager";
import { ServerMessenger } from "./server-messenger";

export const messageHandler = new MessageManager({
  onChat: (room, message, sender) => {
    ServerMessenger.broadcastMessage({
      room,
      message: message,
      from: sender.id,
    });
  },
});
