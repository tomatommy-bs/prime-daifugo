"use client";

import usePartySocket from "partysocket/react";
import { PARTYKIT_HOST } from "../../../constants/env";
import { NextPage } from "next";

interface Props {
  params: Record<"id", string>;
  searchParams: Record<string, string | string[] | undefined>;
}

const Page = ({ params: { id } }: Props) => {
  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    party: "room",
    room: id,
    onMessage: (msg) => {},
    onOpen: () => {},
  });

  return <div></div>;
};

export default Page;
