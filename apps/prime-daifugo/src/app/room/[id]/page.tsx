"use client";

import usePartySocket from "partysocket/react";
import { PARTYKIT_HOST } from "../../../constants/env";
import {
  Affix,
  Avatar,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  TextInput,
} from "@mantine/core";
import { Fragment, useRef, useState } from "react";
import { useListState } from "@mantine/hooks";
import { useMessageHandler } from "./hooks";
import { ClientMessenger } from "./client-messenger";
import * as serverToClient from "../../../interface/server-to-client";
import Cookies from "js-cookie";
import ClientRoomManager from "./room-manager";
import { useRouter } from "next/navigation";

interface Props {
  params: Record<"id", string>;
  searchParams: Record<string, string | string[] | undefined>;
}

const Page = ({ params: { id } }: Props) => {
  const [chats, handler] = useListState<{
    pos: "left" | "right";
    msg: string;
  }>();
  const [presence, setPresence] = useState<
    serverToClient.PresenceEvent["presence"]
  >([]);

  const { onMessage } = useMessageHandler({
    onChat: (message, from, socket) => {
      if (from === socket.id) handler.append({ pos: "right", msg: message });
      else handler.append({ pos: "left", msg: message });
    },
    onPresence: (presence) => {
      setPresence(presence);
    },
    onStartGame: () => {},
  });

  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    party: "room",
    room: id,
    onMessage: (e) => {
      onMessage(e.data, ws);
    },
    onOpen: () => {
      ClientMessenger.sendName({ ws, name: Cookies.get("name") ?? "unknown" });
    },
  });

  const myPresence = presence.find((p) => p.id === ws?.id);

  const handleGameStart = () => {
    ClientMessenger.startGame({ ws });
  };

  const canStartGame = ClientRoomManager.canStartGame(presence);

  return (
    <div>
      <h1>Room {id}</h1>
      <Group>
        {presence.map(({ id, name, status }) => (
          <Paper key={id} p="xs" style={{ width: 200 }}>
            {name} | {status}
          </Paper>
        ))}
        {myPresence?.status === "ready" ? (
          <Button onClick={() => ClientMessenger.unsetReady({ ws })}>
            un ready
          </Button>
        ) : (
          <Button onClick={() => ClientMessenger.setReady({ ws })}>
            ready
          </Button>
        )}
        <Button onClick={handleGameStart} disabled={!canStartGame}>
          start game
        </Button>
      </Group>
    </div>
  );
};

export default Page;
