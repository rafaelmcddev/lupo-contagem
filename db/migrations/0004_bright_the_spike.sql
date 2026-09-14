CREATE TABLE IF NOT EXISTS "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
INSERT INTO "stores" ("name", "slug") VALUES ('Coxim-MS', 'coxim-ms'), ('Campo Grande-MS', 'campo-grande-ms');
--> statement-breakpoint
ALTER TABLE "countings" ADD COLUMN "store_id" integer;
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "store_id" integer;
--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "store_id" integer;
--> statement-breakpoint
UPDATE "countings" SET "store_id" = (SELECT "id" FROM "stores" WHERE "slug" = 'coxim-ms');
--> statement-breakpoint
UPDATE "groups" SET "store_id" = (SELECT "id" FROM "stores" WHERE "slug" = 'coxim-ms');
--> statement-breakpoint
UPDATE "skus" SET "store_id" = (SELECT "id" FROM "stores" WHERE "slug" = 'coxim-ms');
--> statement-breakpoint
ALTER TABLE "countings" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "skus" ALTER COLUMN "store_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countings" ADD CONSTRAINT "countings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "groups" ADD CONSTRAINT "groups_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skus" ADD CONSTRAINT "skus_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_prefix_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "groups_store_id_prefix_unique" ON "groups" USING btree ("store_id","prefix");
--> statement-breakpoint
ALTER TABLE "skus" DROP CONSTRAINT "skus_pkey";
--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "id" serial;
--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skus_store_id_barcode_unique" ON "skus" USING btree ("store_id","barcode");
