import { z } from "zod";

const chatEventSchema = z.object({
  event: z.literal("chat"),
  message: z.string(),
  from: z.string(),
});
export type ChatEvent = z.infer<typeof chatEventSchema>;

const systemEventSchema = z.object({
  event: z.literal("system"),
  action: z.literal("game-start"),
});
export type SystemEvent = z.infer<typeof systemEventSchema>;

export const serverToClientSchema = z.union([
  chatEventSchema,
  systemEventSchema,
]);
