import { pgEnum, pgTable, serial, varchar } from "drizzle-orm/pg-core";

import { CosmeticSlot } from "@/enums/CosmeticSlot";
import { CosmeticType } from "@/enums/CosmeticType";

// Create PostgreSQL enums
export const cosmeticSlotEnum = pgEnum("cosmetic_slot", [
    CosmeticSlot.HAIR,
    CosmeticSlot.HAT, 
    CosmeticSlot.FACE,
    CosmeticSlot.TORSO,
    CosmeticSlot.TROUSER,
    CosmeticSlot.SHOES,
    CosmeticSlot.HAND,
]);

export const cosmeticTypeEnum = pgEnum("cosmetic_type", [
    CosmeticType.BASIC_BROWN_HAIR,
    CosmeticType.LEATHER_CAP,
    CosmeticType.FRIENDLY_SMILE,
    CosmeticType.SIMPLE_SHIRT,
    CosmeticType.BASIC_PANTS,
    CosmeticType.BROWN_BOOTS,
    CosmeticType.LEATHER_GLOVES,
]);

export const cosmetics = pgTable("cosmetics", {
    id: serial().primaryKey(),
    type: cosmeticTypeEnum("type").notNull(),
    slot: cosmeticSlotEnum("slot").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 255 }),
});

export type Cosmetic = typeof cosmetics.$inferSelect;