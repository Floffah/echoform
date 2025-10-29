import { logger } from "@/lib/logger.ts";

let cleanupWorker: Worker | null = null;
let cleanupInterval: Timer | null = null;

/**
 * Start the session cleanup worker that periodically removes expired sessions
 * @param intervalMs Interval in milliseconds (default: 1 hour)
 */
export function startSessionCleanupWorker(intervalMs?: number): void {
    if (cleanupWorker) {
        logger.warn("Session cleanup worker already running");
        return;
    }

    const interval = intervalMs ?? 60 * 60 * 1000;

    logger.info(
        `Starting session cleanup worker with interval: ${interval}ms (${interval / 1000 / 60} minutes)`,
    );

    // Create the worker
    cleanupWorker = new Worker(
        new URL("../workers/sessionCleanup.worker.ts", import.meta.url).href,
    );

    // Handle messages from worker
    cleanupWorker.onmessage = (
        event: MessageEvent<{
            success: boolean;
            deletedCount?: number;
            error?: string;
        }>,
    ) => {
        if (event.data.success) {
            logger.debug(
                `Session cleanup completed: ${event.data.deletedCount} sessions removed`,
            );
        } else {
            logger.error(`Session cleanup failed: ${event.data.error}`);
        }
    };

    cleanupWorker.onerror = (error) => {
        logger.error(error, "Session cleanup worker error");
    };

    // Perform initial cleanup immediately
    cleanupWorker.postMessage("cleanup");

    // Set up periodic cleanup
    cleanupInterval = setInterval(() => {
        cleanupWorker?.postMessage("cleanup");
    }, interval);
}

/**
 * Stop the session cleanup worker
 */
export function stopSessionCleanupWorker(): void {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }

    if (cleanupWorker) {
        cleanupWorker.terminate();
        cleanupWorker = null;
        logger.info("Session cleanup worker stopped");
    }
}
