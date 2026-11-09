CREATE TABLE `enquiry_conversions` (
	`enquiry_id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enquiry_conversions_student_id_unique` ON `enquiry_conversions` (`student_id`);