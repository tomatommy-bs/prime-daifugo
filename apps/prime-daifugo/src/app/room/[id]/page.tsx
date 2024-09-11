"use client";

import usePartySocket from "partysocket/react";
import { PARTYKIT_HOST } from "../../../constants/env";
import { Paper, Stack, TextInput } from "@mantine/core";
import { Fragment, useRef } from "react";
import { useListState } from "@mantine/hooks";
import { useMessageHandler } from "./hooks";
import { ClientMessenger } from "./client-messenger";

interface Props {
  params: Record<"id", string>;
  searchParams: Record<string, string | string[] | undefined>;
}

const Page = ({ params: { id } }: Props) => {
  const [chats, handler] = useListState<{
    pos: "left" | "right";
    msg: string;
  }>();
  const { onMessage } = useMessageHandler({
    onChat: (message, from, socket) => {
      if (from === socket.id) handler.append({ pos: "right", msg: message });
      else handler.append({ pos: "left", msg: message });
    },
  });

  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    party: "room",
    room: id,
    onMessage: (e) => {
      onMessage(e.data, ws);
    },
    onOpen: () => {},
  });

  const chatInputRef = useRef<HTMLInputElement>(null);

  const handleSubmitChat = () => {
    const message = chatInputRef?.current?.value;
    if (!message) return;
    ClientMessenger.sendMessage({ ws, message });
    chatInputRef.current.value = "";
  };

  return (
    <div>
      <h1>Room {id}</h1>

      <Stack>
        {chats.map(({ pos, msg }) => (
          <Fragment>
            {pos === "left" ? (
              <div className="chat chat-start">
                <div className="chat-bubble">{msg}</div>
              </div>
            ) : (
              <div className="chat chat-end">
                <p className="chat-bubble chat-bubble-primary">{msg}</p>
              </div>
            )}
          </Fragment>
        ))}
      </Stack>

      <TextInput ref={chatInputRef} name="message" />
      <button onClick={handleSubmitChat}>Send message</button>
    </div>
  );
};

export default Page;
