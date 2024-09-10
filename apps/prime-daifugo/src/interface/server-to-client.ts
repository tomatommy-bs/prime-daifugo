import { z } from "zod";

const chatEventSchema = z.object({
  event: z.literal("chat"),
  message: z.string(),
});
export type ChatEvent = z.infer<typeof chatEventSchema>;

export const serverToClientSchema = z.union([chatEventSchema, chatEventSchema]);
