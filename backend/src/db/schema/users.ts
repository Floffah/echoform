import { boolean, pgTable, serial, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: serial().primaryKey(),

    name: varchar("name", { length: 100 }).notNull().unique(),
    passwordHash: varchar("password", { length: 72 }).notNull(),

    onboarded: boolean(),
});

export type User = typeof users.$inferSelect;
