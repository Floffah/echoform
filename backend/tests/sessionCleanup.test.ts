import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addDays, subDays } from "date-fns";
import { eq } from "drizzle-orm";

import { db, userSessions, users } from "@/db";
import { cleanupExpiredSessions } from "@/lib/sessionCleanupUtils.ts";
import { getTestableUsername } from "./utils/testableData.ts";

describe("Session Cleanup", () => {
    const testUser = {
        username: getTestableUsername(),
        password: "testpassword",
    };
    let userId: number;

    beforeAll(async () => {
        // Create test user
        const result = await db
            .insert(users)
            .values({
                name: testUser.username,
                passwordHash: "hash",
            })
            .returning();

        userId = result[0]!.id;
    });

    afterAll(async () => {
        // Cleanup test data
        await db.delete(users).where(eq(users.id, userId));
    });

    test("cleanupExpiredSessions removes only expired sessions", async () => {
        const now = new Date();

        // Create an expired session (clearly in the past)
        const expiredSession = await db
            .insert(userSessions)
            .values({
                userId,
                accessToken: "expired-token-" + Date.now(),
                refreshToken: "expired-refresh-" + Date.now(),
                expiresAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 24 hours ago
                refreshTokenExpiresAt: new Date(
                    now.getTime() - 24 * 60 * 60 * 1000,
                ),
            })
            .returning();

        // Create a valid session (clearly in the future)
        const validSession = await db
            .insert(userSessions)
            .values({
                userId,
                accessToken: "valid-token-" + Date.now(),
                refreshToken: "valid-refresh-" + Date.now(),
                expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours from now
                refreshTokenExpiresAt: new Date(
                    now.getTime() + 30 * 24 * 60 * 60 * 1000,
                ),
            })
            .returning();

        // Run cleanup
        await cleanupExpiredSessions();

        // Verify expired session is gone
        const expiredSessionCheck = await db.query.userSessions.findFirst({
            where: (sessions, { eq }) =>
                eq(sessions.id, expiredSession[0]!.id),
        });
        expect(expiredSessionCheck).toBeUndefined();

        // Verify valid session still exists
        const validSessionCheck = await db.query.userSessions.findFirst({
            where: (sessions, { eq }) => eq(sessions.id, validSession[0]!.id),
        });
        expect(validSessionCheck).toBeDefined();

        // Cleanup
        await db
            .delete(userSessions)
            .where(eq(userSessions.id, validSession[0]!.id));
    });

    test("cleanupExpiredSessions returns 0 when no expired sessions", async () => {
        const deletedCount = await cleanupExpiredSessions();
        expect(deletedCount).toBe(0);
    });
});
