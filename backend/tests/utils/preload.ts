import { redis } from "bun";
import { afterAll, beforeAll, mock } from "bun:test";
import chalkTemplate from "chalk-template";
import { like } from "drizzle-orm";

import { db, users } from "@/db";

export let server: Bun.Server<never>;

beforeAll(async () => {
    // Mock the alias path used by production imports
    await mock.module("@/constants/timeouts.ts", () => ({
        AUTH_TIMEOUT: 1000,
    }));
});

afterAll(async () => {
    const keysToDelete = await redis.keys("test:*");

    console.debug(
        chalkTemplate`\n\n{blueBright.bold preload.ts} Deleting redis test keys: {grey ${keysToDelete.join(", ")}}`,
    );

    if (keysToDelete.length >= 1) {
        await redis.del(keysToDelete[0]!, ...keysToDelete.slice(1));
    }

    const deleteResult = await db
        .delete(users)
        .where(like(users.name, "test:%"));

    console.debug(
        chalkTemplate`{blueBright.bold preload.ts} Deleted ${deleteResult.rowCount} test users from database.`,
    );
});
