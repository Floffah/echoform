#!/usr/bin/env bun
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { migrate as migratePG } from "drizzle-orm/bun-sql/migrator";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";

import { db, schema } from "@/db";

if (process.env["DATABASE_URL"]) {
    if (process.env["DATABASE_URL"].includes("localhost")) {
        await migratePG(db as BunSQLDatabase<typeof schema>, {
            migrationsFolder: "./drizzle",
        });
    } else {
        await migrateNeon(db as NeonHttpDatabase<typeof schema>, {
            migrationsFolder: "./drizzle",
        });
    }
}
