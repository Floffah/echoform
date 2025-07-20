import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const apps = sqliteTable("apps", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    orgSlug: text("org_slug").notNull(),
});

export const machines = sqliteTable("machines", {
    id: text("id").primaryKey(), // Use UUID or generated ID
    name: text("name"),
    appName: text("app_name").notNull().references(() => apps.name),
    region: text("region").default("local"),
    state: text("state").default("created"), // created, started, stopped, suspended, destroyed
    image: text("image"),
    config: text("config"), // JSON string of machine config
    containerId: text("container_id"), // Docker container ID
    privateIp: text("private_ip"),
    createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});
