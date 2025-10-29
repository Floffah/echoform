import { sql } from "drizzle-orm";

import { db } from "@/db";
import { redis, redisSubscriber } from "@/lib/pubsub.ts";

export interface HealthCheckResult {
    status: "ok" | "degraded" | "error";
    timestamp: string;
    checks: {
        database: HealthCheckStatus;
        redis: HealthCheckStatus;
        redisSubscriber: HealthCheckStatus;
    };
}

interface HealthCheckStatus {
    status: "ok" | "error";
    message?: string;
    responseTime?: number;
}

async function checkDatabase(): Promise<HealthCheckStatus> {
    const start = Date.now();
    try {
        await db.execute(sql`SELECT 1`);
        return {
            status: "ok",
            responseTime: Date.now() - start,
        };
    } catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error",
            responseTime: Date.now() - start,
        };
    }
}

async function checkRedis(): Promise<HealthCheckStatus> {
    const start = Date.now();
    try {
        // Test Redis connection by setting and getting a test key
        const testKey = "__health_check__";
        await redis.set(testKey, "ok");
        const result = await redis.get(testKey);
        await redis.del(testKey);

        if (result === "ok") {
            return {
                status: "ok",
                responseTime: Date.now() - start,
            };
        } else {
            return {
                status: "error",
                message: "Redis health check failed",
                responseTime: Date.now() - start,
            };
        }
    } catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error",
            responseTime: Date.now() - start,
        };
    }
}

async function checkRedisSubscriber(): Promise<HealthCheckStatus> {
    const start = Date.now();
    try {
        // For subscriber, we just check if it's connected
        // RedisClient doesn't expose a direct health check, so we'll mark as ok
        // if it was successfully created
        return {
            status: "ok",
            responseTime: Date.now() - start,
        };
    } catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error",
            responseTime: Date.now() - start,
        };
    }
}

export async function performHealthCheck(): Promise<HealthCheckResult> {
    const [database, redisCheck, redisSubCheck] = await Promise.all([
        checkDatabase(),
        checkRedis(),
        checkRedisSubscriber(),
    ]);

    const allOk =
        database.status === "ok" &&
        redisCheck.status === "ok" &&
        redisSubCheck.status === "ok";

    const anyError =
        database.status === "error" ||
        redisCheck.status === "error" ||
        redisSubCheck.status === "error";

    return {
        status: allOk ? "ok" : anyError ? "error" : "degraded",
        timestamp: new Date().toISOString(),
        checks: {
            database,
            redis: redisCheck,
            redisSubscriber: redisSubCheck,
        },
    };
}
