import { SQL } from "bun";
import { beforeAll } from "bun:test";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { migrate as migratePG } from "drizzle-orm/bun-sql/migrator";

import { db, schema } from "@/db";

beforeAll(async () => {
    // ensure postgres database exists
    const urlWithoutDb = process.env.DATABASE_URL?.replace(/\/[^\/]+$/, "")!;
    const dbName = process.env.DATABASE_URL?.split("/").pop()!;

    const pg = new SQL(urlWithoutDb + "/echoform-authoritative");

    // list existing databases
    const databases = await pg<
        {
            datname: string;
        }[]
    >`SELECT datname FROM pg_database;`;

    if (!databases.some((db) => db.datname === dbName)) {
        console.log(`Database ${dbName} does not exist. Creating...`);
        await pg`CREATE DATABASE "${pg.unsafe(dbName)}";`;
        console.log(`Database ${dbName} created.`);
    } else {
        console.log(`Database ${dbName} already exists.`);
    }

    console.log("Running migrations...");
    await migratePG(db as BunSQLDatabase<typeof schema>, {
        migrationsFolder: "./drizzle",
    });

    await pg.close()
});
