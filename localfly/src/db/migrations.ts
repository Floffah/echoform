import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

// Embedded migration files
const migrations = {
    "0000_yellow_jamie_braddock.sql": `CREATE TABLE \`apps\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`org_slug\` text NOT NULL
);`,
    "0001_wooden_blizzard.sql": `CREATE TABLE \`events\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`machine_id\` text NOT NULL,
	\`type\` text NOT NULL,
	\`status\` text NOT NULL,
	\`timestamp\` text NOT NULL,
	\`request\` text,
	\`source\` text,
	FOREIGN KEY (\`machine_id\`) REFERENCES \`machines\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE \`machines\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`app_id\` integer NOT NULL,
	\`name\` text,
	\`state\` text DEFAULT 'stopped' NOT NULL,
	\`region\` text NOT NULL,
	\`instance_id\` text,
	\`private_ip\` text,
	\`config\` text,
	\`image_ref\` text,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	\`container_id\` text,
	FOREIGN KEY (\`app_id\`) REFERENCES \`apps\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE \`secrets\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`app_id\` integer NOT NULL,
	\`name\` text NOT NULL,
	\`digest\` text NOT NULL,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	FOREIGN KEY (\`app_id\`) REFERENCES \`apps\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE \`volumes\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`app_id\` integer NOT NULL,
	\`name\` text NOT NULL,
	\`region\` text NOT NULL,
	\`size_gb\` integer NOT NULL,
	\`state\` text DEFAULT 'created' NOT NULL,
	\`encrypted\` integer DEFAULT false NOT NULL,
	\`fstype\` text DEFAULT 'ext4',
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	FOREIGN KEY (\`app_id\`) REFERENCES \`apps\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
};

// Embedded journal file
const journalContent = {
    "version": "7",
    "dialect": "sqlite",
    "entries": [
        {
            "idx": 0,
            "version": "6",
            "when": 1751049603264,
            "tag": "0000_yellow_jamie_braddock",
            "breakpoints": true
        },
        {
            "idx": 1,
            "version": "6",
            "when": 1753116624007,
            "tag": "0001_wooden_blizzard",
            "breakpoints": true
        }
    ]
};

// Embedded snapshots (using placeholders as they're not critical for migration)
const snapshots = {
    "0000_snapshot.json": "{}",
    "0001_snapshot.json": "{}"
};

export async function runEmbeddedMigrations(db: unknown) {
    // Create temporary directory for migration files
    const tempMigrationsDir = join(tmpdir(), `localfly-migrations-${Date.now()}`);
    const tempMetaDir = join(tempMigrationsDir, "meta");
    
    try {
        // Create temporary directories
        await mkdir(tempMigrationsDir, { recursive: true });
        await mkdir(tempMetaDir, { recursive: true });
        
        // Write migration files
        for (const [filename, content] of Object.entries(migrations)) {
            await writeFile(join(tempMigrationsDir, filename), content);
        }
        
        // Write journal file
        await writeFile(
            join(tempMetaDir, "_journal.json"), 
            JSON.stringify(journalContent, null, 2)
        );
        
        // Write snapshot files
        for (const [filename, content] of Object.entries(snapshots)) {
            await writeFile(join(tempMetaDir, filename), content);
        }
        
        // Run migrations
        migrate(db as any, {
            migrationsFolder: tempMigrationsDir,
        });
        
        return true;
    } finally {
        // Clean up temporary files
        try {
            await rm(tempMigrationsDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}