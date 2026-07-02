CREATE TABLE `credit_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`stripe_session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`discogs_release_id` integer NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`credits_spent` integer NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`discogs_url` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recommendation_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`results` text DEFAULT '[]' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spotify_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`top_artists` text DEFAULT '[]' NOT NULL,
	`top_albums` text DEFAULT '[]' NOT NULL,
	`top_genres` text DEFAULT '[]' NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `taste_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`genres` text DEFAULT '[]' NOT NULL,
	`decades` text DEFAULT '[]' NOT NULL,
	`moods` text DEFAULT '[]' NOT NULL,
	`album_preference` text DEFAULT 'balanced' NOT NULL,
	`deep_cut_level` integer DEFAULT 50 NOT NULL,
	`completed_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wishlist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discogs_release_id` integer NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`cover_url` text,
	`year` integer,
	`notes` text DEFAULT '',
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_items_discogs_release_id_unique` ON `wishlist_items` (`discogs_release_id`);