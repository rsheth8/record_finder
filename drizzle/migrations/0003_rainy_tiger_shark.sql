CREATE TABLE `recommendation_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`discogs_release_id` integer NOT NULL,
	`artist` text DEFAULT '' NOT NULL,
	`signal` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_user_release_idx` ON `recommendation_feedback` (`user_id`,`discogs_release_id`);--> statement-breakpoint
CREATE INDEX `feedback_user_idx` ON `recommendation_feedback` (`user_id`);