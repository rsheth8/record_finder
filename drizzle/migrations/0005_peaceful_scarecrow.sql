CREATE TABLE `price_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discogs_release_id` integer NOT NULL,
	`lowest_price` real,
	`currency` text DEFAULT 'USD' NOT NULL,
	`num_for_sale` integer DEFAULT 0 NOT NULL,
	`snapshot_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `price_history_release_idx` ON `price_history` (`discogs_release_id`,`snapshot_at`);--> statement-breakpoint
ALTER TABLE `wishlist_items` ADD `price_at_add` real;--> statement-breakpoint
ALTER TABLE `wishlist_items` ADD `last_alerted_price` real;