// MUST BE IMPORTED AS A MACRO
import type { DrizzleSQLiteSnapshotJSON } from "drizzle-kit/api";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

export function getMigrations() {
    const migrationsPath = resolve(process.cwd(), "drizzle");
    const migrationsFiles = readdirSync(migrationsPath);

    const migrations = migrationsFiles
        .filter((file) => file.endsWith(".sql"))
        .map((file) => {
            const filePath = resolve(migrationsPath, file);
            const content = readFileSync(filePath, "utf-8");
            return {
                name: file,
                content: content.trim(),
            };
        });

    const metaPath = resolve(migrationsPath, "meta");
    const metaFiles = readdirSync(metaPath);

    const meta = metaFiles
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
            const filePath = resolve(metaPath, file);
            const content = readFileSync(filePath, "utf-8");
            return {
                name: file,
                content: JSON.parse(content) as DrizzleSQLiteSnapshotJSON,
            };
        });

    return { migrations, meta };
}
