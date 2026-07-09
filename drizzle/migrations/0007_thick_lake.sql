CREATE TABLE `offer_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discogs_release_id` integer NOT NULL,
	`offers` text DEFAULT '[]' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offer_cache_release_idx` ON `offer_cache` (`discogs_release_id`);