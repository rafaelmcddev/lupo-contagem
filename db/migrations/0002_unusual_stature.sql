CREATE TYPE "public"."counting_source" AS ENUM('manual', 'xml');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"counting_id" integer NOT NULL,
	"barcode" text NOT NULL,
	"sku" text,
	"name" text,
	"expected_qty" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "countings" ADD COLUMN "source" "counting_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "countings" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "countings" ADD COLUMN "supplier_name" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_counting_id_countings_id_fk" FOREIGN KEY ("counting_id") REFERENCES "public"."countings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
