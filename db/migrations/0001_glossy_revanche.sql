ALTER TABLE "countings" ADD COLUMN "require_sku_used" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "name" text;