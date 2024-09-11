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

  onSetReady: (room, sender) => {
    sender.setState({ ...sender.state, status: "ready" });
    ServerMessenger.broadcastPresence({ room });
  },

  onUnsetReady: (room, sender) => {
    sender.setState({ ...sender.state, status: "not-ready" });
    ServerMessenger.broadcastPresence({ room });
  },

  onStartGame: (room, sender) => {
    console.log("start game");
  },
});
