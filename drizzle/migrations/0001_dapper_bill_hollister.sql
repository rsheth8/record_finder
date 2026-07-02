DROP INDEX `wishlist_items_discogs_release_id_unique`;--> statement-breakpoint
ALTER TABLE `wishlist_items` ADD `user_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_user_release_idx` ON `wishlist_items` (`user_id`,`discogs_release_id`);--> statement-breakpoint
ALTER TABLE `recommendation_cache` ADD `user_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_cache_user_idx` ON `recommendation_cache` (`user_id`);--> statement-breakpoint
ALTER TABLE `spotify_snapshot` ADD `user_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `spotify_snapshot_user_idx` ON `spotify_snapshot` (`user_id`);--> statement-breakpoint
ALTER TABLE `taste_profile` ADD `user_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `taste_profile_user_idx` ON `taste_profile` (`user_id`);