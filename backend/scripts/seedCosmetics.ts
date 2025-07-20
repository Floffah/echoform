import { cosmetics } from "@/db/schema/cosmetics";
import { CosmeticSlot } from "@/enums/CosmeticSlot";
import { CosmeticType } from "@/enums/CosmeticType";
import { db } from "@/db";

export async function seedCosmetics() {
    const cosmeticsData = [
        {
            type: CosmeticType.BASIC_BROWN_HAIR,
            slot: CosmeticSlot.HAIR,
            name: "Basic Brown Hair",
            description: "A simple brown hairstyle for beginners"
        },
        {
            type: CosmeticType.LEATHER_CAP,
            slot: CosmeticSlot.HAT,
            name: "Leather Cap",
            description: "A sturdy leather cap for protection"
        },
        {
            type: CosmeticType.FRIENDLY_SMILE,
            slot: CosmeticSlot.FACE,
            name: "Friendly Smile",
            description: "A warm and welcoming facial expression"
        },
        {
            type: CosmeticType.SIMPLE_SHIRT,
            slot: CosmeticSlot.TORSO,
            name: "Simple Shirt",
            description: "A basic cotton shirt for everyday wear"
        },
        {
            type: CosmeticType.BASIC_PANTS,
            slot: CosmeticSlot.TROUSER,
            name: "Basic Pants",
            description: "Comfortable pants for daily activities"
        },
        {
            type: CosmeticType.BROWN_BOOTS,
            slot: CosmeticSlot.SHOES,
            name: "Brown Boots",
            description: "Durable brown boots for walking"
        },
        {
            type: CosmeticType.LEATHER_GLOVES,
            slot: CosmeticSlot.HAND,
            name: "Leather Gloves",
            description: "Protective leather gloves for handling"
        }
    ];

    try {
        await db.insert(cosmetics).values(cosmeticsData).onConflictDoNothing();
        console.log("Cosmetics seeded successfully");
    } catch (error) {
        console.error("Error seeding cosmetics:", error);
    }
}