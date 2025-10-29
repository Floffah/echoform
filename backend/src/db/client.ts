import type { Logger } from "drizzle-orm";
import { type BunSQLDatabase, drizzle as drizzlePG } from "drizzle-orm/bun-sql";
import {
    type NeonHttpDatabase,
    drizzle as drizzleNeon,
} from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

import { logger } from "@/lib/logger.ts";
import * as schema from "./schema";

let db: NeonHttpDatabase<typeof schema> | BunSQLDatabase<typeof schema>;

const drizzleLogger: Logger = {
    logQuery(query: string, params: unknown[]) {
        logger.trace("Query %s (%s)", query, params.join(","));
    },
};

if (typeof process.env["DATABASE_URL"] === "string") {
    if (process.env["DATABASE_URL"].includes("localhost")) {
        // For local PostgreSQL, use Bun's built-in SQL driver with pooling
        db = drizzlePG(process.env["DATABASE_URL"], {
            logger: drizzleLogger,
            schema,
        });
    } else {
        // For Neon serverless, configure with pooling settings
        const sql = neon(process.env["DATABASE_URL"], {
            // Enable connection pooling
            fullResults: true,
        });

        db = drizzleNeon(sql, {
            logger: drizzleLogger,
            schema,
        });
    }
}

export { db };
