import z from "zod";

import { CosmeticType } from "@/enums/CosmeticType.ts";
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

export const requestCosmeticsPacket = basePacketSchema.extend({
    id: z.literal("request_cosmetics"),
    data: z.null().optional(),
});

export const requestUserCosmeticsPacket = basePacketSchema.extend({
    id: z.literal("request_user_cosmetics"),
    data: z.null().optional(),
});

export const equipCosmeticPacket = basePacketSchema.extend({
    id: z.literal("equip_cosmetic"),
    data: z.object({
        cosmeticType: z.nativeEnum(CosmeticType),
    }),
});

export const unequipCosmeticPacket = basePacketSchema.extend({
    id: z.literal("unequip_cosmetic"),
    data: z.object({
        cosmeticType: z.nativeEnum(CosmeticType),
    }),
});

export const serverboundPacket = z.union([
    clientDeclarationPacket,
    clientReadyPacket,
    requestCosmeticsPacket,
    requestUserCosmeticsPacket,
    equipCosmeticPacket,
    unequipCosmeticPacket,
]);

export type ServerboundPacket = z.infer<typeof serverboundPacket>;
