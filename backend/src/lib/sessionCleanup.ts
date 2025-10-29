import { lt } from "drizzle-orm";

import { db, userSessions } from "@/db";
import { logger } from "@/lib/logger.ts";

/**
 * Clean up expired user sessions from the database
 * @returns Number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
    const now = new Date();

    try {
        const result = await db
            .delete(userSessions)
            .where(lt(userSessions.expiresAt, now));

        const deletedCount = result.rowCount ?? 0;

        if (deletedCount > 0) {
            logger.info(
                `Cleaned up ${deletedCount} expired session(s) from database`,
            );
        }

        return deletedCount;
    } catch (error) {
        logger.error(error, "Failed to clean up expired sessions");
        throw error;
    }
}

/**
 * Start a periodic cleanup job for expired sessions
 * @param intervalMs Interval in milliseconds (default: from config or 1 hour)
 * @returns Function to stop the cleanup job
 */
export function startSessionCleanupJob(intervalMs?: number): () => void {
    const interval = intervalMs ?? 60 * 60 * 1000;

    logger.info(
        `Starting session cleanup job with interval: ${interval}ms (${interval / 1000 / 60} minutes)`,
    );

    const intervalId = setInterval(() => {
        cleanupExpiredSessions().catch((error) => {
            logger.error(error, "Session cleanup job failed");
        });
    }, interval);

    // Run cleanup immediately on start
    cleanupExpiredSessions().catch((error) => {
        logger.error(error, "Initial session cleanup failed");
    });

    return () => {
        clearInterval(intervalId);
        logger.info("Session cleanup job stopped");
    };
}
