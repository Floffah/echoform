import { boolean, integer, pgTable, serial } from "drizzle-orm/pg-core";

import { cosmetics } from "@/db/schema/cosmetics";
import { users } from "@/db/schema/users";

export const userCosmetics = pgTable("user_cosmetics", {
    id: serial().primaryKey(),
    
    userId: integer("user_id")
        .references(() => users.id, {
            onDelete: "cascade",
        })
        .notNull(),
        
    cosmeticId: integer("cosmetic_id")
        .references(() => cosmetics.id, {
            onDelete: "cascade",
        })
        .notNull(),
        
    owned: boolean("owned").notNull().default(false),
    equipped: boolean("equipped").notNull().default(false),
});

export type UserCosmetic = typeof userCosmetics.$inferSelect;