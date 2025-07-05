import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const apps = sqliteTable("apps", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    orgSlug: text("org_slug").notNull(),
});
