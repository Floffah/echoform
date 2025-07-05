import * as schema from "./schema";
import { neon } from "@neondatabase/serverless";
import type { Logger } from "drizzle-orm";
import { type BunSQLDatabase, drizzle as drizzlePG } from "drizzle-orm/bun-sql";
import {
    type NeonHttpDatabase,
    drizzle as drizzleNeon,
} from "drizzle-orm/neon-http";

import { logger } from "@/lib/logger.ts";

let db: NeonHttpDatabase<typeof schema> | BunSQLDatabase<typeof schema>;

const drizzleLogger: Logger = {
    logQuery(query: string, params: unknown[]) {
        logger.trace("Query %s (%s)", query, params.join(","));
    },
};

if (typeof process.env["DATABASE_URL"] === "string") {
    if (process.env["DATABASE_URL"].includes("localhost")) {
        db = drizzlePG(process.env["DATABASE_URL"], {
            logger: drizzleLogger,
            schema,
        });
    } else {
        db = drizzleNeon(neon(process.env["DATABASE_URL"]), {
            logger: drizzleLogger,
            schema,
        });
    }
}

export { db };
