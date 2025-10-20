import { z } from "zod";

import { EnforcedStateName } from "@/enums/EnforcedStateName.ts";
import { ErrorCode, WarningCode } from "@/enums/ErrorCode.ts";
import { KickReason } from "@/enums/KickReason.ts";
import { SceneName } from "@/enums/SceneName.ts";
import { zodNanoid } from "@/lib/zodValidators.ts";
import { basePacketSchema } from "@/protocol/packet/base.ts";
import {
    environmentSchema,
    featureFlagNameSchema,
} from "@/protocol/schemas.ts";

export const keepalivePacketSchema = basePacketSchema.extend({
    id: z.literal("keepalive"),
    data: z.null(),
});

export const errorPacketSchema = basePacketSchema.extend({
    id: z.literal("error"),
    data: z.object({
        message: z.string().optional(),
        code: z.union([z.string(), z.nativeEnum(ErrorCode)]),
        fatal: z.boolean().optional(),
        cause: z.any().optional(),
    }),
});

export const warningPacketSchema = basePacketSchema.extend({
    id: z.literal("warning"),
    data: z.object({
        message: z.string(),
        code: z.union([z.string(), z.nativeEnum(WarningCode)]),
        cause: z.any().optional(),
    }),
});

export const kickPacketSchema = basePacketSchema.extend({
    id: z.literal("kick"),
    data: z.object({
        reason: z.nativeEnum(KickReason),
    }),
});

export const acknowledgePacketSchema = basePacketSchema.extend({
    id: z.literal("acknowledge"),
    data: z.object({
        connectionId: zodNanoid,
    }),
});

export const welcomePacketSchema = basePacketSchema.extend({
    id: z.literal("welcome"),
    data: z.object({
        serverVersion: z.string(),
        environment: environmentSchema,
        featureFlags: z.array(featureFlagNameSchema),
    }),
});

export const forceScenePacketSchema = basePacketSchema.extend({
    id: z.literal("force_scene"),
    data: z.object({
        scene: z.nativeEnum(SceneName),
    }),
});

/**
 * USE VIA GameClientConnection.setEnforcedState, DO NOT SEND DIRECTLY
 */
export const setEnforcedStatePacketSchema = basePacketSchema.extend({
    id: z.literal("set_enforced_state"),
    data: z.object({
        name: z.nativeEnum(EnforcedStateName),
        value: z.boolean(),
    }),
});

export const clientboundPacket = z.union([
    keepalivePacketSchema,
    errorPacketSchema,
    warningPacketSchema,
    kickPacketSchema,
    acknowledgePacketSchema,
    welcomePacketSchema,
    forceScenePacketSchema,
    setEnforcedStatePacketSchema,
]);

export type ClientboundPacket = z.infer<typeof clientboundPacket>;
