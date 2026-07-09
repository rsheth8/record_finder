CREATE TABLE `local_shops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`city` text,
	`region` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_shops_domain_idx` ON `local_shops` (`domain`);