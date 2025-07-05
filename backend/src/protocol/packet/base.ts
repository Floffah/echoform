import { z } from "zod";

export const basePacketSchema = z.object({
    id: z.string(),
    data: z.any(),
    sentAt: z.number().optional(),
});
