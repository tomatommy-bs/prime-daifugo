import assert from "assert";
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

  onSetName: (room, name, sender) => {
    assert(sender.state);
    sender.setState({ ...sender.state, name: name });
    ServerMessenger.broadcastPresence({ room });
  },

  onSetReady: (room, sender) => {
    assert(sender.state);
    sender.setState({ ...sender.state, status: "ready" });
    ServerMessenger.broadcastPresence({ room });
  },

  onUnsetReady: (room, sender) => {
    assert(sender.state);
    sender.setState({ ...sender.state, status: "not-ready" });
    ServerMessenger.broadcastPresence({ room });
  },

  onStartGame: (room, sender) => {
    assert(sender.state);
    console.log("start game");
  },
});
