CREATE TABLE `behavior` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`date` text NOT NULL,
	`lesson` integer,
	`subject` text,
	`teacher` text,
	`kind` text NOT NULL,
	`justified` integer,
	`notified` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `behavior_external_id_unique` ON `behavior` (`external_id`);--> statement-breakpoint
CREATE TABLE `conversation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facts_key_unique` ON `facts` (`key`);--> statement-breakpoint
CREATE TABLE `grades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`subject` text NOT NULL,
	`grade` real,
	`grade_text` text,
	`kind` text,
	`title` text,
	`date` text,
	`notified` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grades_external_id_unique` ON `grades` (`external_id`);--> statement-breakpoint
CREATE TABLE `group_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wa_message_id` text NOT NULL,
	`group_id` text NOT NULL,
	`group_name` text,
	`sender` text,
	`text` text NOT NULL,
	`sent_at` text NOT NULL,
	`parsed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_messages_wa_message_id_unique` ON `group_messages` (`wa_message_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`starts_at` text,
	`ends_at` text,
	`due_date` text,
	`amount` real,
	`link` text,
	`status` text DEFAULT 'open' NOT NULL,
	`source_message_id` integer,
	`calendar_event_id` text,
	`dedupe_key` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source_message_id`) REFERENCES `group_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_dedupe_key_unique` ON `items` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `nutrition_plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text,
	`meal` text NOT NULL,
	`time` text,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`remind_at` text NOT NULL,
	`text` text NOT NULL,
	`item_id` integer,
	`sent` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `timetable` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`lesson` integer NOT NULL,
	`subject` text NOT NULL,
	`teacher` text,
	`room` text,
	`is_sports` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timetable_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`date` text NOT NULL,
	`lesson` integer NOT NULL,
	`kind` text NOT NULL,
	`subject` text,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timetable_changes_uniq` ON `timetable_changes` (`source`,`date`,`lesson`,`kind`);--> statement-breakpoint
CREATE TABLE `workout_plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`order` integer NOT NULL,
	`exercise` text NOT NULL,
	`sets` integer,
	`reps` text,
	`rest_seconds` integer,
	`notes` text
);
