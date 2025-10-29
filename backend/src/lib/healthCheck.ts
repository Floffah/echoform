import { logger } from "@/lib/logger.ts";

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

let healthWorker: Worker | null = null;
let cachedHealthResult: HealthCheckResult | null = null;
let healthCheckInterval: Timer | null = null;

/**
 * Start the health check worker that periodically monitors system health
 * @param intervalMs Interval in milliseconds (default: 30 seconds)
 */
export function startHealthCheckWorker(intervalMs: number = 30000): void {
    if (healthWorker) {
        logger.warn("Health check worker already running");
        return;
    }

    logger.info(
        `Starting health check worker with interval: ${intervalMs}ms (${intervalMs / 1000} seconds)`,
    );

    // Create the worker
    healthWorker = new Worker(
        new URL("../workers/healthCheck.worker.ts", import.meta.url).href,
    );

    // Handle messages from worker
    healthWorker.onmessage = (event: MessageEvent<HealthCheckResult>) => {
        cachedHealthResult = event.data;
        logger.debug("Health check completed", event.data);
    };

    healthWorker.onerror = (error) => {
        logger.error(error, "Health check worker error");
    };

    // Perform initial check immediately
    healthWorker.postMessage("check");

    // Set up periodic checks
    healthCheckInterval = setInterval(() => {
        healthWorker?.postMessage("check");
    }, intervalMs);
}

/**
 * Stop the health check worker
 */
export function stopHealthCheckWorker(): void {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }

    if (healthWorker) {
        healthWorker.terminate();
        healthWorker = null;
        logger.info("Health check worker stopped");
    }
}

/**
 * Get the cached health check result
 * Returns the most recent health check from the worker
 */
export function getCachedHealthCheck(): HealthCheckResult {
    if (!cachedHealthResult) {
        // Return a default result if no check has been performed yet
        return {
            status: "degraded",
            timestamp: new Date().toISOString(),
            checks: {
                database: {
                    status: "error",
                    message: "Health check not yet initialized",
                },
                redis: {
                    status: "error",
                    message: "Health check not yet initialized",
                },
                redisSubscriber: {
                    status: "error",
                    message: "Health check not yet initialized",
                },
            },
        };
    }

    return cachedHealthResult;
}
