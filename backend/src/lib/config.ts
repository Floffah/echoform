import { z } from "zod";

/**
 * Environment variable schema
 */
const envSchema = z.object({
    NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z
        .enum(["trace", "debug", "info", "warn", "error", "fatal"])
        .default("debug"),
    DATABASE_URL: z.string().url(),
    VALKEY_URL: z.string().url().optional(),
    SESSION_CLEANUP_INTERVAL_MS: z.coerce
        .number()
        .default(60 * 60 * 1000), // Default: 1 hour
    AUTH_TIMEOUT_MS: z.coerce.number().default(30000), // Default: 30 seconds
});

/**
 * Validated and typed environment configuration
 */
export const config = envSchema.parse(process.env);

/**
 * Type-safe environment accessor
 */
export type Config = z.infer<typeof envSchema>;
