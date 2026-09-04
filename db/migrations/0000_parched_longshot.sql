CREATE TYPE "public"."counting_status" AS ENUM('active', 'finished');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "boxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"counting_id" integer NOT NULL,
	"box_number" integer NOT NULL,
	"prefix" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "countings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"prefix_length_used" integer NOT NULL,
	"status" "counting_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"prefix" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"box_id" integer NOT NULL,
	"barcode" text NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skus" (
	"barcode" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "boxes" ADD CONSTRAINT "boxes_counting_id_countings_id_fk" FOREIGN KEY ("counting_id") REFERENCES "public"."countings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scans" ADD CONSTRAINT "scans_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "boxes_counting_id_prefix_unique" ON "boxes" USING btree ("counting_id","prefix");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "boxes_counting_id_box_number_unique" ON "boxes" USING btree ("counting_id","box_number");