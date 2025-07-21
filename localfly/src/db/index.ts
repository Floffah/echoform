import { Database } from "bun:sqlite";
import type { Logger } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { resolve } from "path";

import { logger } from "@/lib/logger.ts";
import { runEmbeddedMigrations } from "./migrations.ts";

import * as schema from "./schema";

const sqlite = new Database(resolve(process.cwd(), "localfly.db"));

const db = drizzle(sqlite, {
    schema,
    logger: {
        logQuery(query: string, params: unknown[]) {
            logger.debug("Query %s (%s)", query, params.join(","));
        },
    } as Logger,
});

// Run embedded migrations
try {
    await runEmbeddedMigrations(db);
    logger.info("Database migrations completed successfully");
} catch (error) {
    logger.warn("Database migration failed, this might be expected:", error);
}

export { db };
