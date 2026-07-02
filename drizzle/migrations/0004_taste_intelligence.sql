ALTER TABLE `spotify_snapshot` ADD `top_artists_by_term` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `spotify_snapshot` ADD `top_tracks_by_term` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `spotify_snapshot` ADD `saved_albums` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `spotify_snapshot` ADD `saved_tracks` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `spotify_snapshot` ADD `recently_played` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `spotify_snapshot` ADD `taste_vector` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TABLE `quiz_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`album_preferences` text DEFAULT '[]' NOT NULL,
	`sub_genres` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_responses_user_idx` ON `quiz_responses` (`user_id`);
