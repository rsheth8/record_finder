CREATE TABLE `release_enrichment_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discogs_release_id` integer NOT NULL,
	`currency` text NOT NULL,
	`data` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_enrichment_cache_release_currency_idx` ON `release_enrichment_cache` (`discogs_release_id`,`currency`);