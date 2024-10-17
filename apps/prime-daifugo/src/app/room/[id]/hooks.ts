import PartySocket from "partysocket";
import * as serverToClient from "../../../interface/server-to-client";

interface UseMessageHandlerProps {
  onChat?: (message: string, from: string, socket: PartySocket) => void;
  onPresence?: (presence: serverToClient.PresenceEvent["presence"]) => void;
  onStartGame?: () => void;
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
        }
      }
    }
  };

  return { onMessage };
};
