"use client";

import usePartySocket from "partysocket/react";
import { PARTYKIT_HOST } from "../../../constants/env";
import { notifications } from "@mantine/notifications";
import { Paper, TextInput } from "@mantine/core";
import { useRef } from "react";
import * as clientToServer from "../../../interface/client-to-server";
import * as serverToClient from "../../../interface/server-to-client";
import { useListState } from "@mantine/hooks";

interface Props {
  params: Record<"id", string>;
  searchParams: Record<string, string | string[] | undefined>;
}

const Page = ({ params: { id } }: Props) => {
  const [chats, handler] = useListState<string>();

  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    party: "room",
    room: id,
    onMessage: (e) => {
      const payload = serverToClient.serverToClientSchema.parse(
        JSON.parse(e.data)
      );
      if (payload.event === "chat") handler.append(payload.message);
    },
    onOpen: () => {},
  });

  const chatInputRef = useRef<HTMLInputElement>(null);

  const handleSubmitChat = () => {
    const message = chatInputRef?.current?.value;
    if (!message) return;
    const payload: clientToServer.ChatEvent = {
      event: "chat",
      message: chatInputRef?.current?.value,
    };
    ws.send(JSON.stringify(payload));
    chatInputRef.current.value = "";
  };

  return (
    <div>
      <h1>Room {id}</h1>
      <TextInput ref={chatInputRef} name="message" />
      <button onClick={handleSubmitChat}>Send message</button>

      <Paper>
        {chats.map((chat) => (
          <div key={chat}>{chat}</div>
        ))}
      </Paper>
    </div>
  );
};

export default Page;
