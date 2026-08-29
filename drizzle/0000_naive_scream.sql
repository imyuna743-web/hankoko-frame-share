CREATE TABLE `frame_likes` (
	`frame_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`frame_id`, `visitor_id`),
	FOREIGN KEY (`frame_id`) REFERENCES `frames`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `frame_reports` (
	`frame_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`frame_id`, `visitor_id`),
	FOREIGN KEY (`frame_id`) REFERENCES `frames`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `frames` (
	`id` text PRIMARY KEY NOT NULL,
	`image_key` text NOT NULL,
	`image_type` text NOT NULL,
	`nickname` text NOT NULL,
	`shape_tag` text NOT NULL,
	`tags` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`likes_count` integer DEFAULT 0 NOT NULL,
	`reports_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
