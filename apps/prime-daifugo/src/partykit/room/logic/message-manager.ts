import type * as Party from "partykit/server";
import { clientToServerSchema } from "@/interface/client-to-server";
import { ConnectionState } from "@/interface/connection";

interface Event {
  onChat?: (
    room: Party.Room,
    message: string,
    sender: Party.Connection<ConnectionState>
  ) => void;
  onSetReady?: (
    room: Party.Room,
    sender: Party.Connection<ConnectionState>
  ) => void;
  onUnsetReady?: (
    room: Party.Room,
    sender: Party.Connection<ConnectionState>
  ) => void;
  onStartGame?: (
    room: Party.Room,
    sender: Party.Connection<ConnectionState>
  ) => void;
}

export class MessageManager {
  onChat?: Event["onChat"];
  onSetReady?: Event["onSetReady"];
  onUnsetReady?: Event["onUnsetReady"];
  onStartGame?: Event["onStartGame"];

  constructor(args: Event) {
    this.onChat = args.onChat;
    this.onSetReady = args.onSetReady;
    this.onUnsetReady = args.onUnsetReady;
    this.onStartGame = args.onStartGame;
  }

  onMessage(
    room: Party.Room,
    payload: string,
    sender: Party.Connection<ConnectionState>
  ) {
    const msg = clientToServerSchema.parse(JSON.parse(payload));

    switch (msg.event) {
      case "chat":
        this.onChat?.(room, msg.message, sender);
        break;
      case "room":
        switch (msg.action) {
          case "set-ready":
            this.onSetReady?.(room, sender);
            break;
          case "unset-ready":
            this.onUnsetReady?.(room, sender);
            break;
          case "start-game":
            this.onStartGame?.(room, sender);
            break;
        }
    }
  }
}
