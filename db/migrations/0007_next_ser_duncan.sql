CREATE TYPE "public"."whatsapp_send_status" AS ENUM('sent', 'opened', 'failed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_send_type" AS ENUM('purchase', 'reminder');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cashback_cleanup_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rows_deleted" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"sale_id" integer,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"type" "whatsapp_send_type" NOT NULL,
	"status" "whatsapp_send_status" NOT NULL,
	"trigger" text NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cashback_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cashback_cleanup_log" ADD CONSTRAINT "cashback_cleanup_log_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_sends" ADD CONSTRAINT "whatsapp_sends_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_sends" ADD CONSTRAINT "whatsapp_sends_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
