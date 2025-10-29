import {
    index,
    integer,
    pgTable,
    serial,
    timestamp,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "@/db/schema/users";

export const userSessions = pgTable(
    "user_sessions",
    {
        id: serial("id").primaryKey(),
        userId: integer("user_id")
            .references(() => users.id, {
                onDelete: "cascade",
            })
            .notNull(),

        accessToken: varchar("token", { length: 256 }).notNull().unique(),
        refreshToken: varchar("refresh_token", { length: 256 })
            .notNull()
            .unique(),

        expiresAt: timestamp("expires_at").notNull(),
        refreshTokenExpiresAt: timestamp("refresh_expires_at").notNull(),
    },
    (table) => [
        index("user_sessions_user_id_idx").on(table.userId),
        index("user_sessions_expires_at_idx").on(table.expiresAt),
    ],
);

export type UserSession = typeof userSessions.$inferSelect;
