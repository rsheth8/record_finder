CREATE TABLE `cover_color_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discogs_release_id` integer NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cover_color_cache_release_idx` ON `cover_color_cache` (`discogs_release_id`);