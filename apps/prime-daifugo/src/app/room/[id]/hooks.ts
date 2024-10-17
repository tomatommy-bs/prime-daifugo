import PartySocket from "partysocket";
import * as serverToClient from "../../../interface/server-to-client";
import { ROOM_STATUS } from "@/constants/status";

interface UseMessageHandlerProps {
  onChat?: (message: string, from: string, socket: PartySocket) => void;
  onPresence?: (presence: serverToClient.PresenceEvent["presence"]) => void;
  onStartGame?: () => void;
  onRoomStatus?: (
    status: (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS]
  ) => void;
}

export const useMessageHandler = (props: UseMessageHandlerProps) => {
  const onMessage = (payload: string, socket: PartySocket) => {
    const data = serverToClient.serverToClientSchema.parse(JSON.parse(payload));

    switch (data.event) {
      case "chat":
        props.onChat?.(data.message, data.from, socket);
        break;
      case "presence":
        props.onPresence?.(data.presence);
        break;
      case "system": {
        switch (data.action) {
          case "game-start":
            props.onStartGame?.();
            break;
          default:
            throw new Error(data.action satisfies never);
        }
        break;
      }
      case "room-status":
        props.onRoomStatus?.(data.status);
        break;
      default:
        throw new Error(data satisfies never);
    }
  };

  return { onMessage };
};
