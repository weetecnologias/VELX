CREATE TABLE `gallery_albums` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Training' NOT NULL,
	`event_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`permission_confirmed` integer DEFAULT 0 NOT NULL,
	`permission_reference` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gallery_album_status" CHECK("gallery_albums"."status" IN ('Draft','Published','Archived')),
	CONSTRAINT "gallery_album_permission" CHECK("gallery_albums"."permission_confirmed" IN (0,1) AND ("gallery_albums"."status" != 'Published' OR "gallery_albums"."permission_confirmed" = 1)),
	CONSTRAINT "gallery_album_order" CHECK("gallery_albums"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `gallery_album_public_order` ON `gallery_albums` (`status`,`sort_order`);--> statement-breakpoint
CREATE TABLE `gallery_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`object_key` text NOT NULL,
	`alt_text` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_cover` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `gallery_albums`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gallery_photo_values" CHECK("gallery_photos"."width" > 0 AND "gallery_photos"."height" > 0 AND "gallery_photos"."byte_size" > 0 AND "gallery_photos"."byte_size" <= 2097152 AND "gallery_photos"."sort_order" >= 0 AND "gallery_photos"."is_cover" IN (0,1) AND "gallery_photos"."archived" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_photos_object_key_unique` ON `gallery_photos` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_photo_content` ON `gallery_photos` (`album_id`,`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_album_cover` ON `gallery_photos` (`album_id`) WHERE "gallery_photos"."is_cover" = 1 AND "gallery_photos"."archived" = 0;--> statement-breakpoint
CREATE INDEX `gallery_photo_order` ON `gallery_photos` (`album_id`,`archived`,`sort_order`);
--> statement-breakpoint
CREATE TRIGGER gallery_publish_has_photos BEFORE UPDATE OF status ON gallery_albums
WHEN NEW.status='Published' AND NOT EXISTS(SELECT 1 FROM gallery_photos WHERE album_id=NEW.id AND archived=0)
BEGIN SELECT RAISE(ABORT,'gallery_requires_photo'); END;
--> statement-breakpoint
CREATE TRIGGER gallery_album_limit_insert BEFORE INSERT ON gallery_albums
WHEN NEW.status!='Archived' AND (SELECT COUNT(*) FROM gallery_albums WHERE status!='Archived')>=50
BEGIN SELECT RAISE(ABORT,'gallery_album_limit'); END;
--> statement-breakpoint
CREATE TRIGGER gallery_album_limit_restore BEFORE UPDATE OF status ON gallery_albums
WHEN OLD.status='Archived' AND NEW.status!='Archived' AND (SELECT COUNT(*) FROM gallery_albums WHERE status!='Archived')>=50
BEGIN SELECT RAISE(ABORT,'gallery_album_limit'); END;
--> statement-breakpoint
CREATE TRIGGER gallery_details_require_draft BEFORE UPDATE ON gallery_albums
WHEN OLD.status!='Draft' AND (NEW.title!=OLD.title OR NEW.caption!=OLD.caption OR NEW.category!=OLD.category OR NEW.event_date!=OLD.event_date OR NEW.sort_order!=OLD.sort_order OR NEW.permission_confirmed!=OLD.permission_confirmed OR NEW.permission_reference!=OLD.permission_reference)
BEGIN SELECT RAISE(ABORT,'gallery_draft_required'); END;
--> statement-breakpoint
CREATE TRIGGER gallery_photo_insert_draft BEFORE INSERT ON gallery_photos
WHEN (SELECT status FROM gallery_albums WHERE id=NEW.album_id)!='Draft'
BEGIN SELECT RAISE(ABORT,'gallery_draft_required'); END;
--> statement-breakpoint
CREATE TRIGGER gallery_photo_update_draft BEFORE UPDATE ON gallery_photos
WHEN (SELECT status FROM gallery_albums WHERE id=OLD.album_id)!='Draft' OR NEW.album_id!=OLD.album_id
BEGIN SELECT RAISE(ABORT,'gallery_draft_required'); END;
--> statement-breakpoint
CREATE TRIGGER gallery_photo_limit_insert BEFORE INSERT ON gallery_photos
WHEN NEW.archived=0 AND (SELECT COUNT(*) FROM gallery_photos WHERE album_id=NEW.album_id AND archived=0)>=20
BEGIN SELECT RAISE(ABORT,'gallery_photo_limit'); END;
--> statement-breakpoint
CREATE TRIGGER gallery_photo_limit_restore BEFORE UPDATE OF archived ON gallery_photos
WHEN OLD.archived=1 AND NEW.archived=0 AND (SELECT COUNT(*) FROM gallery_photos WHERE album_id=NEW.album_id AND archived=0)>=20
BEGIN SELECT RAISE(ABORT,'gallery_photo_limit'); END;
