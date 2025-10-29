import { logger } from "@/lib/logger.ts";
import { cleanupExpiredSessions } from "@/lib/sessionCleanupUtils.ts";

// Worker message handler
self.onmessage = async (event: MessageEvent) => {
    if (event.data === "cleanup") {
        try {
            const deletedCount = await cleanupExpiredSessions();
            if (deletedCount > 0) {
                logger.info(
                    `Cleaned up ${deletedCount} expired session(s) from database`,
                );
            }
            self.postMessage({ success: true, deletedCount });
        } catch (error) {
            logger.error(error, "Session cleanup failed in worker");
            self.postMessage({
                success: false,
                error:
                    error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
};
