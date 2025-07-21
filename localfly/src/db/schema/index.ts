import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const apps = sqliteTable("apps", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    orgSlug: text("org_slug").notNull(),
});

export const machines = sqliteTable("machines", {
    id: text("id").primaryKey(),
    appId: integer("app_id").notNull().references(() => apps.id),
    name: text("name"),
    state: text("state").notNull().default("stopped"),
    region: text("region").notNull(),
    instanceId: text("instance_id"),
    privateIp: text("private_ip"),
    config: text("config", { mode: "json" }),
    imageRef: text("image_ref"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    containerId: text("container_id"),
});

export const volumes = sqliteTable("volumes", {
    id: text("id").primaryKey(),
    appId: integer("app_id").notNull().references(() => apps.id),
    name: text("name").notNull(),
    region: text("region").notNull(),
    sizeGb: integer("size_gb").notNull(),
    state: text("state").notNull().default("created"),
    encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
    fstype: text("fstype").default("ext4"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
});

export const secrets = sqliteTable("secrets", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    appId: integer("app_id").notNull().references(() => apps.id),
    name: text("name").notNull(),
    digest: text("digest").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
});

export const events = sqliteTable("events", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    machineId: text("machine_id").notNull().references(() => machines.id),
    type: text("type").notNull(),
    status: text("status").notNull(),
    timestamp: text("timestamp").notNull(),
    request: text("request", { mode: "json" }),
    source: text("source"),
});
