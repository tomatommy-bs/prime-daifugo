import PartySocket from "partysocket";
import * as serverToClient from "../../../interface/server-to-client";

interface UseMessageHandlerProps {
  onChat?: (message: string, from: string, socket: PartySocket) => void;
}

export const useMessageHandler = (props: UseMessageHandlerProps) => {
  const onMessage = (payload: string, socket: PartySocket) => {
    const data = serverToClient.serverToClientSchema.parse(JSON.parse(payload));

    switch (data.event) {
      case "chat":
        props.onChat?.(data.message, data.from, socket);
        break;
    }
  };

  return { onMessage };
};
