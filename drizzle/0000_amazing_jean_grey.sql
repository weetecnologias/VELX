CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`audience` text DEFAULT 'All' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`student_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`marked_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`student_id`, `batch_id`, `date`),
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attendance_status" CHECK("attendance"."status" IN ('Present','Absent','Leave'))
);
--> statement-breakpoint
CREATE INDEX `attendance_date` ON `attendance` (`date`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_date` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `batch_enrollments` (
	`student_id` text NOT NULL,
	`batch_id` text NOT NULL,
	PRIMARY KEY(`student_id`, `batch_id`),
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `enrollment_batch` ON `batch_enrollments` (`batch_id`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`programme_id` text NOT NULL,
	`coach_id` text,
	`days` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`capacity` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`programme_id`) REFERENCES `programmes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "batch_capacity" CHECK("batches"."capacity" > 0 AND "batches"."capacity" <= 500)
);
--> statement-breakpoint
CREATE TABLE `belt_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`belt_id` text NOT NULL,
	`fee` integer DEFAULT 0 NOT NULL,
	`eligibility` text NOT NULL,
	FOREIGN KEY (`belt_id`) REFERENCES `belt_levels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `belt_levels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rank` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `belt_levels_name_unique` ON `belt_levels` (`name`);--> statement-breakpoint
CREATE TABLE `belt_results` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`student_id` text NOT NULL,
	`result` text NOT NULL,
	`grade` text DEFAULT '' NOT NULL,
	`certificate` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `belt_exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_student` ON `belt_results` (`exam_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `coaches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coaches_user_id_unique` ON `coaches` (`user_id`);--> statement-breakpoint
CREATE TABLE `enquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`tracking_hash` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`age` integer NOT NULL,
	`programme_id` text,
	`preferred_batch` text DEFAULT '' NOT NULL,
	`location` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'New' NOT NULL,
	`assigned_to` text,
	`followup_date` text,
	`student_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`programme_id`) REFERENCES `programmes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "enquiry_status_values" CHECK("enquiries"."status" IN ('New','Contacted','Trial Scheduled','Trial Attended','Follow-up','Converted','Lost')),
	CONSTRAINT "enquiry_age" CHECK("enquiries"."age" BETWEEN 3 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enquiries_code_unique` ON `enquiries` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `enquiries_student_id_unique` ON `enquiries` (`student_id`);--> statement-breakpoint
CREATE INDEX `enquiry_status` ON `enquiries` (`status`);--> statement-breakpoint
CREATE TABLE `enquiry_followups` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expense_amount" CHECK("expenses"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE `fee_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`months` integer NOT NULL,
	`amount` integer NOT NULL,
	CONSTRAINT "plan_values" CHECK("fee_plans"."months" IN (1,3,6,12) AND "fee_plans"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`due_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoice_amount" CHECK("invoices"."amount" > 0 AND "invoices"."discount" >= 0 AND "invoices"."discount" <= "invoices"."amount")
);
--> statement-breakpoint
CREATE INDEX `invoice_student` ON `invoices` (`student_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `parent_student_links` (
	`parent_id` text NOT NULL,
	`student_id` text NOT NULL,
	PRIMARY KEY(`parent_id`, `student_id`),
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `parents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parents_user_id_unique` ON `parents` (`user_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` integer NOT NULL,
	`mode` text NOT NULL,
	`reference` text NOT NULL,
	`paid_at` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "positive_payment" CHECK("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_idempotency_key_unique` ON `payments` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payment_invoice` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `programmes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`age_group` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `programmes_name_unique` ON `programmes` (`name`);--> statement-breakpoint
CREATE TABLE `progress` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`coach_id` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`payment_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_number_unique` ON `receipts` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_payment_id_unique` ON `receipts` (`payment_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `student_private` (
	`student_id` text PRIMARY KEY NOT NULL,
	`medical_notes` text DEFAULT '' NOT NULL,
	`emergency_contact` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`admission_number` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`dob` text NOT NULL,
	`phone` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`programme_id` text NOT NULL,
	`joining_date` text NOT NULL,
	`plan_id` text,
	`belt_id` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`photo_key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`programme_id`) REFERENCES `programmes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `fee_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`belt_id`) REFERENCES `belt_levels`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "student_status" CHECK("students"."status" IN ('Active','Inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_admission_number_unique` ON `students` (`admission_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_user_id_unique` ON `students` (`user_id`);--> statement-breakpoint
CREATE INDEX `student_programme` ON `students` (`programme_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "user_role" CHECK("users"."role" IN ('Super Admin','Admin','Coach','Parent','Student'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_platform_id_unique` ON `users` (`platform_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);