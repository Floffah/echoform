import type { FeatureFlagName } from "@/protocol/schemas.ts";

export const featureFlags: FeatureFlagName[] = [];

if (process.env.NODE_ENV !== "production") {
    featureFlags.push("enableDebugMode");
    featureFlags.push("enableExperimentalFeatures");
}
