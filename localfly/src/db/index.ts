import { Database } from "bun:sqlite";
import type { Logger } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { exists, mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

import { getMigrations } from "@/db/getMigrations.ts" with { type: "macro" };
import { logger } from "@/lib/logger.ts";

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

const drizzleDir = resolve(process.cwd(), "drizzle");
const metaDir = resolve(drizzleDir, "meta");
const existsDrizzleDir = await exists(drizzleDir);

if (!existsDrizzleDir) {
    const { migrations, meta } = getMigrations();

    await mkdir(drizzleDir, { recursive: true });
    await mkdir(metaDir, { recursive: true });

    for (const migration of migrations) {
        const filePath = resolve(drizzleDir, migration.name);
        await writeFile(filePath, migration.content);
    }

    for (const metaFile of meta) {
        const filePath = resolve(metaDir, metaFile.name);
        await writeFile(filePath, JSON.stringify(metaFile.content, null, 2));
    }
}

migrate(db, {
    migrationsFolder: "./drizzle",
});

export { db };
