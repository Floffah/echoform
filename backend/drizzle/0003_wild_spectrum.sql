CREATE TYPE "public"."cosmetic_slot" AS ENUM('HAIR', 'HAT', 'FACE', 'TORSO', 'TROUSER', 'SHOES', 'HAND');--> statement-breakpoint
CREATE TYPE "public"."cosmetic_type" AS ENUM('BASIC_BROWN_HAIR', 'LEATHER_CAP', 'FRIENDLY_SMILE', 'SIMPLE_SHIRT', 'BASIC_PANTS', 'BROWN_BOOTS', 'LEATHER_GLOVES');--> statement-breakpoint
CREATE TABLE "cosmetics" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "cosmetic_type" NOT NULL,
	"slot" "cosmetic_slot" NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "user_cosmetics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"cosmetic_id" integer NOT NULL,
	"owned" boolean DEFAULT false NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_cosmetic_id_cosmetics_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."cosmetics"("id") ON DELETE cascade ON UPDATE no action;