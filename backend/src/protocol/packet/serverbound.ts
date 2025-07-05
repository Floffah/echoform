import z from "zod";

import { TOKEN_LENGTH } from "@/lib/constants.ts";
import { zodNanoid } from "@/lib/zodValidators.ts";
import { basePacketSchema } from "@/protocol/packet/base.ts";

export const clientDeclarationPacket = basePacketSchema.extend({
    id: z.literal("client_declaration"),
    data: z.object({
        accessToken: zodNanoid.length(TOKEN_LENGTH),
    }),
});

export const clientReadyPacket = basePacketSchema.extend({
    id: z.literal("client_ready"),
    data: z.null().optional(),
});

export const serverboundPacket = z.union([
    clientDeclarationPacket,
    clientReadyPacket,
]);

export type ServerboundPacket = z.infer<typeof serverboundPacket>;
