CREATE TYPE "public"."erasure_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_principal_id" text NOT NULL,
	"subscriber_id" text NOT NULL,
	"purpose" text NOT NULL,
	"consent_given" boolean NOT NULL,
	"consent_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_address" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "data_breach_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"notified_cert_in_at" timestamp with time zone,
	"notified_principals_at" timestamp with time zone,
	"description" text NOT NULL,
	"affected_records" integer DEFAULT 0,
	"data_categories" text[],
	"remedial_actions" text[],
	"status" text DEFAULT 'DETECTED',
	"cert_in_report_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_principal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_id" text NOT NULL,
	"request_type" text NOT NULL,
	"details" text,
	"requested_at" timestamp with time zone DEFAULT now(),
	"responded_at" timestamp with time zone,
	"response_deadline" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PENDING',
	"response" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "erasure_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_principal_id" text NOT NULL,
	"subscriber_id" text NOT NULL,
	"reason" text,
	"status" "erasure_status" DEFAULT 'PENDING',
	"records_anonymized" integer DEFAULT 0,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"severity" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"reported_at" timestamp with time zone,
	"cert_in_report_id" text,
	"affected_systems" text[],
	"remediation" text[],
	"status" text DEFAULT 'DETECTED',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "settlement_instructions" ADD COLUMN "signature" text;--> statement-breakpoint
ALTER TABLE "settlement_instructions" ADD COLUMN "signed_by" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "pq_signing_public_key" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "pq_encryption_public_key" text;--> statement-breakpoint
CREATE INDEX "idx_consent_principal" ON "consent_records" USING btree ("data_principal_id");--> statement-breakpoint
CREATE INDEX "idx_consent_subscriber" ON "consent_records" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_consent_purpose" ON "consent_records" USING btree ("data_principal_id","purpose");--> statement-breakpoint
CREATE INDEX "idx_dpr_principal" ON "data_principal_requests" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "idx_dpr_status" ON "data_principal_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_dpr_deadline" ON "data_principal_requests" USING btree ("response_deadline");--> statement-breakpoint
CREATE INDEX "idx_erasure_principal" ON "erasure_requests" USING btree ("data_principal_id");--> statement-breakpoint
CREATE INDEX "idx_erasure_status" ON "erasure_requests" USING btree ("status");--> statement-breakpoint
ALTER TABLE "settlement_instructions" ADD CONSTRAINT "idx_si_order_unique" UNIQUE("order_id","collector_subscriber_id","receiver_subscriber_id");