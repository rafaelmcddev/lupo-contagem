ALTER TABLE "stores" ADD COLUMN "cashback_percent" double precision;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "cashback_expiry_days" integer;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "whatsapp_message_template" text;