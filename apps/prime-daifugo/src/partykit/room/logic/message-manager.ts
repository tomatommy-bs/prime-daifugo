import type * as Party from "partykit/server";
import { clientToServerSchema } from "../../../interface/client-to-server";

interface Event {
  onChat?: (message: string, sender: Party.Connection) => void;
  onSetReady?: (sender: Party.Connection) => void;
  onUnsetReady?: (sender: Party.Connection) => void;
  onStartGame?: (sender: Party.Connection) => void;
}

export class MessageManager {
  room: Party.Room;
  onChat?: Event["onChat"];
  onSetReady?: Event["onSetReady"];
  onUnsetReady?: Event["onUnsetReady"];
  onStartGame?: Event["onStartGame"];

  constructor(room: Party.Room, args: Event) {
    this.room = room;
    this.onChat = args.onChat;
    this.onSetReady = args.onSetReady;
    this.onUnsetReady = args.onUnsetReady;
    this.onStartGame = args.onStartGame;
  }

  onMessage(payload: string, sender: Party.Connection) {
    const msg = clientToServerSchema.parse(JSON.parse(payload));

    switch (msg.event) {
      case "chat":
        this.onChat?.(msg.message, sender);
        break;
      case "room":
        switch (msg.action) {
          case "set-ready":
            this.onSetReady?.(sender);
            break;
          case "unset-ready":
            this.onUnsetReady?.(sender);
            break;
          case "start-game":
            this.onStartGame?.(sender);
            break;
        }
    }
  }
}
