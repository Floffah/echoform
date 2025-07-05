import { z } from "zod";

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
