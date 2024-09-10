import { z } from "zod";

const chatEventSchema = z.object({
  event: z.literal("chat"),
  message: z.string(),
});
export type ChatEvent = z.infer<typeof chatEventSchema>;

const roomEventSchema = z.object({
  event: z.literal("room"),
  action: z.union([
    z.literal("set-ready"),
    z.literal("unset-ready"),
    z.literal("start-game"),
  ]),
});
export type RoomEvent = z.infer<typeof roomEventSchema>;

export const clientToServerSchema = z.union([chatEventSchema, roomEventSchema]);
export type ClientToServer = z.infer<typeof clientToServerSchema>;
