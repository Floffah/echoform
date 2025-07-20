CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`app_name` text NOT NULL,
	`region` text DEFAULT 'local',
	`state` text DEFAULT 'created',
	`image` text,
	`config` text,
	`container_id` text,
	`private_ip` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`app_name`) REFERENCES `apps`(`name`) ON UPDATE no action ON DELETE no action
);
