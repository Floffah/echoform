import { z } from "zod";

import { CosmeticSlot } from "@/enums/CosmeticSlot.ts";
import { CosmeticType } from "@/enums/CosmeticType.ts";

export const environmentSchema = z.union([
    z.literal("production"),
    z.literal("development"),
]);

export type Environment = z.infer<typeof environmentSchema>;

export const featureFlagNameSchema = z.union([
    z.literal("enableExperimentalFeatures"),
    z.literal("enableDebugMode"),
]);

export type FeatureFlagName = z.infer<typeof featureFlagNameSchema>;

// Cosmetic schemas
export const cosmeticSchema = z.object({
    id: z.number(),
    type: z.nativeEnum(CosmeticType),
    slot: z.nativeEnum(CosmeticSlot),
    name: z.string(),
    description: z.string().nullable(),
});

export type Cosmetic = z.infer<typeof cosmeticSchema>;

export const userCosmeticSchema = z.object({
    id: z.number(),
    userId: z.number(),
    cosmeticId: z.number(),
    owned: z.boolean(),
    equipped: z.boolean(),
});

export type UserCosmetic = z.infer<typeof userCosmeticSchema>;
