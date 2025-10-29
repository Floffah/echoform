import type { Context, Next } from "hono";

import { logger } from "@/lib/logger.ts";
import { redis } from "@/lib/pubsub.ts";

interface RateLimitOptions {
    windowMs: number; // Time window in milliseconds
    max: number; // Max requests per window
    keyPrefix?: string; // Redis key prefix
    skip?: (c: Context) => boolean; // Function to skip rate limiting for certain requests
}

/**
 * Simple rate limiter middleware using Redis
 */
export function rateLimit(options: RateLimitOptions) {
    const {
        windowMs,
        max,
        keyPrefix = "rate-limit",
        skip = () => false,
    } = options;

    return async (c: Context, next: Next) => {
        // Skip rate limiting if specified
        if (skip(c)) {
            return next();
        }

        // Get client identifier (IP address or custom header)
        const clientId =
            c.req.header("x-forwarded-for") ||
            c.req.header("x-real-ip") ||
            "unknown";

        const key = `${keyPrefix}:${clientId}`;

        try {
            // Get current count
            const current = await redis.get(key);
            const count = current ? parseInt(current, 10) : 0;

            if (count >= max) {
                logger.warn(
                    `Rate limit exceeded for ${clientId}: ${count}/${max} requests`,
                );

                return c.json(
                    {
                        error: "Too many requests",
                        message: "Rate limit exceeded. Please try again later.",
                    },
                    429,
                );
            }

            // Increment count
            const newCount = count + 1;
            await redis.set(key, newCount.toString());

            // Set expiry on first request
            if (count === 0) {
                await redis.expire(key, Math.ceil(windowMs / 1000));
            }

            // Add rate limit headers
            c.header("X-RateLimit-Limit", max.toString());
            c.header("X-RateLimit-Remaining", (max - newCount).toString());

            return next();
        } catch (error) {
            // If Redis is down, log error but don't block requests
            logger.error(error, "Rate limiting error - allowing request");
            return next();
        }
    };
}
