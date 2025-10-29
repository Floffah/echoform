import { lt } from "drizzle-orm";

import { db, userSessions } from "@/db";

/**
 * Clean up expired user sessions from the database
 * This is a utility function used by the worker and can be used in tests
 * @returns Number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
    const now = new Date();

    const result = await db
        .delete(userSessions)
        .where(lt(userSessions.expiresAt, now));

    return result.rowCount ?? 0;
}
