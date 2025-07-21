CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`machine_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`timestamp` text NOT NULL,
	`request` text,
	`source` text,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` integer NOT NULL,
	`name` text,
	`state` text DEFAULT 'stopped' NOT NULL,
	`region` text NOT NULL,
	`instance_id` text,
	`private_ip` text,
	`config` text,
	`image_ref` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`container_id` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer NOT NULL,
	`name` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `volumes` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` integer NOT NULL,
	`name` text NOT NULL,
	`region` text NOT NULL,
	`size_gb` integer NOT NULL,
	`state` text DEFAULT 'created' NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`fstype` text DEFAULT 'ext4',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
