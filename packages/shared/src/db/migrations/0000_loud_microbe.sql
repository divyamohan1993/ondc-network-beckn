CREATE TYPE "public"."admin_role" AS ENUM('SUPER_ADMIN', 'ADMIN', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('INFO', 'WARNING', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_state" AS ENUM('Pending', 'Packed', 'Agent-assigned', 'Order-picked-up', 'In-transit', 'At-destination-hub', 'Out-for-delivery', 'Order-delivered', 'Cancelled', 'RTO-Initiated', 'RTO-Delivered');--> statement-breakpoint
CREATE TYPE "public"."issue_category" AS ENUM('ORDER', 'ITEM', 'FULFILLMENT', 'AGENT');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('CREATED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RETURNED');--> statement-breakpoint
CREATE TYPE "public"."rating_category" AS ENUM('ORDER', 'ITEM', 'FULFILLMENT', 'AGENT', 'PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."recon_status" AS ENUM('01_MATCHED', '02_UNMATCHED', '03_DISPUTED', '04_OVERPAID', '05_UNDERPAID');--> statement-breakpoint
CREATE TYPE "public"."routing_type" AS ENUM('P2P', 'P2H2P');--> statement-breakpoint
CREATE TYPE "public"."secret_status" AS ENUM('ACTIVE', 'ROTATING', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('PAID', 'NOT_PAID', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."simulation_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('INITIATED', 'UNDER_SUBSCRIPTION', 'SUBSCRIBED', 'SUSPENDED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."subscriber_type" AS ENUM('BAP', 'BPP', 'BG');--> statement-breakpoint
CREATE TYPE "public"."teardown_status" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('SENT', 'ACK', 'NACK', 'CALLBACK_RECEIVED', 'TIMEOUT', 'ERROR');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "admin_role" DEFAULT 'VIEWER',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_login" timestamp with time zone,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "aggregated_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"details" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"state" text,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "cities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"schema_version" text DEFAULT '1.1.0',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "domains_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "fulfillment_state_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fulfillment_id" uuid NOT NULL,
	"from_state" "fulfillment_state",
	"to_state" "fulfillment_state" NOT NULL,
	"triggered_by" text,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"fulfillment_id" text NOT NULL,
	"type" text DEFAULT 'Delivery',
	"routing_type" "routing_type" DEFAULT 'P2P',
	"state" "fulfillment_state" DEFAULT 'Pending',
	"provider_id" text,
	"agent_name" text,
	"agent_phone" text,
	"vehicle_registration" text,
	"tracking_url" text,
	"estimated_delivery" timestamp with time zone,
	"actual_delivery" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "fulfillments_order_id_fulfillment_id" UNIQUE("order_id","fulfillment_id")
);
--> statement-breakpoint
CREATE TABLE "health_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"status" "alert_status" DEFAULT 'OPEN',
	"message" text NOT NULL,
	"details" jsonb,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"status" text NOT NULL,
	"response_time_ms" integer,
	"details" jsonb,
	"checked_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"order_id" text,
	"bap_id" text NOT NULL,
	"bpp_id" text NOT NULL,
	"category" "issue_category" NOT NULL,
	"sub_category" text NOT NULL,
	"status" "issue_status" DEFAULT 'OPEN' NOT NULL,
	"short_desc" text NOT NULL,
	"long_desc" text,
	"complainant_info" jsonb,
	"respondent_actions" jsonb DEFAULT '[]'::jsonb,
	"resolution" jsonb,
	"resolution_provider" jsonb,
	"expected_response_time" timestamp with time zone,
	"expected_resolution_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issues_issue_id_unique" UNIQUE("issue_id")
);
--> statement-breakpoint
CREATE TABLE "network_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_state_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"from_state" "order_state",
	"to_state" "order_state" NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"bap_id" text NOT NULL,
	"bpp_id" text NOT NULL,
	"domain" text NOT NULL,
	"city" text NOT NULL,
	"state" "order_state" DEFAULT 'CREATED' NOT NULL,
	"provider" jsonb,
	"items" jsonb,
	"billing" jsonb,
	"fulfillments" jsonb,
	"quote" jsonb,
	"payment" jsonb,
	"cancellation_reason_code" text,
	"cancelled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rating_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"order_id" text,
	"bap_id" text NOT NULL,
	"bpp_id" text NOT NULL,
	"rating_category" "rating_category" NOT NULL,
	"rated_entity_id" text NOT NULL,
	"value" integer NOT NULL,
	"feedback_form" jsonb,
	"feedback_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_rating_id_unique" UNIQUE("rating_id")
);
--> statement-breakpoint
CREATE TABLE "rotation_hooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret_name" text NOT NULL,
	"callback_url" text NOT NULL,
	"headers" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" text NOT NULL,
	"order_id" text NOT NULL,
	"collector_app_id" text NOT NULL,
	"receiver_app_id" text NOT NULL,
	"settlement_type" text NOT NULL,
	"settlement_status" "settlement_status" DEFAULT 'PENDING' NOT NULL,
	"settlement_amount" numeric(12, 2) NOT NULL,
	"settlement_currency" text DEFAULT 'INR' NOT NULL,
	"settlement_reference" text,
	"settlement_timestamp" timestamp with time zone,
	"buyer_finder_fee_type" text,
	"buyer_finder_fee_amount" numeric(12, 2),
	"withholding_amount" numeric(12, 2),
	"settlement_counterparty" text,
	"settlement_phase" text,
	"settlement_bank_account_no" text,
	"settlement_ifsc_code" text,
	"upi_address" text,
	"recon_status" "recon_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"config" jsonb NOT NULL,
	"stats" jsonb,
	"status" "simulation_status" DEFAULT 'RUNNING'
);
--> statement-breakpoint
CREATE TABLE "subscriber_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" text NOT NULL,
	"domain" text NOT NULL,
	"city" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_domains_subscriber_id_domain_city" UNIQUE("subscriber_id","domain","city")
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" text NOT NULL,
	"subscriber_url" text NOT NULL,
	"type" "subscriber_type",
	"domain" text,
	"city" text,
	"signing_public_key" text NOT NULL,
	"encr_public_key" text,
	"unique_key_id" text NOT NULL,
	"status" "subscriber_status" DEFAULT 'INITIATED',
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"webhook_url" text,
	"is_simulated" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "subscribers_subscriber_id_unique" UNIQUE("subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "teardown_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" "teardown_status" DEFAULT 'PENDING',
	"progress" integer DEFAULT 0,
	"steps_completed" jsonb,
	"error" text,
	"initiated_by" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" text NOT NULL,
	"message_id" text NOT NULL,
	"action" text NOT NULL,
	"bap_id" text,
	"bpp_id" text,
	"domain" text,
	"city" text,
	"request_body" jsonb,
	"response_body" jsonb,
	"status" "transaction_status" DEFAULT 'SENT',
	"error" jsonb,
	"latency_ms" integer,
	"is_simulated" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vault_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"previous_encrypted_value" text,
	"service" text NOT NULL,
	"version" integer DEFAULT 1,
	"rotation_interval_seconds" integer,
	"status" "secret_status" DEFAULT 'ACTIVE',
	"last_rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "vault_secrets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "vault_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"scope" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fulfillment_state_transitions" ADD CONSTRAINT "fulfillment_state_transitions_fulfillment_id_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_state_transitions" ADD CONSTRAINT "order_state_transitions_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_domains" ADD CONSTRAINT "subscriber_domains_subscriber_id_subscribers_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("subscriber_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_aggregated_logs_service" ON "aggregated_logs" USING btree ("service");--> statement-breakpoint
CREATE INDEX "idx_aggregated_logs_level" ON "aggregated_logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_aggregated_logs_timestamp" ON "aggregated_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_fst_fulfillment_id" ON "fulfillment_state_transitions" USING btree ("fulfillment_id");--> statement-breakpoint
CREATE INDEX "idx_fulfillments_order_id" ON "fulfillments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_fulfillments_state" ON "fulfillments" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_health_alerts_service" ON "health_alerts" USING btree ("service");--> statement-breakpoint
CREATE INDEX "idx_health_alerts_status" ON "health_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_health_alerts_created_at" ON "health_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_health_snapshots_service" ON "health_snapshots" USING btree ("service");--> statement-breakpoint
CREATE INDEX "idx_health_snapshots_checked_at" ON "health_snapshots" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "idx_issues_issue_id" ON "issues" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_issues_transaction_id" ON "issues" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_issues_order_id" ON "issues" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_issues_status" ON "issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_issues_created_at" ON "issues" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_order_state_transitions_order_id" ON "order_state_transitions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_order_id" ON "orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_transaction_id" ON "orders" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_orders_bap_id" ON "orders" USING btree ("bap_id");--> statement-breakpoint
CREATE INDEX "idx_orders_bpp_id" ON "orders" USING btree ("bpp_id");--> statement-breakpoint
CREATE INDEX "idx_orders_state" ON "orders" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ratings_transaction_id" ON "ratings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_ratings_order_id" ON "ratings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_ratings_bpp_id" ON "ratings" USING btree ("bpp_id");--> statement-breakpoint
CREATE INDEX "idx_ratings_rated_entity_id" ON "ratings" USING btree ("rated_entity_id");--> statement-breakpoint
CREATE INDEX "idx_ratings_rating_category" ON "ratings" USING btree ("rating_category");--> statement-breakpoint
CREATE INDEX "idx_settlements_transaction_id" ON "settlements" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_settlements_order_id" ON "settlements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_settlements_settlement_status" ON "settlements" USING btree ("settlement_status");--> statement-breakpoint
CREATE INDEX "idx_subscriber_domains_subscriber_id" ON "subscriber_domains" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_subscriber_domains_domain" ON "subscriber_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_subscriber_domains_domain_city" ON "subscriber_domains" USING btree ("domain","city");--> statement-breakpoint
CREATE INDEX "idx_transactions_transaction_id" ON "transactions" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_message_id" ON "transactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_bap_id" ON "transactions" USING btree ("bap_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_bpp_id" ON "transactions" USING btree ("bpp_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_created_at" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_vault_tokens_service_id" ON "vault_tokens" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "idx_vault_tokens_expires_at" ON "vault_tokens" USING btree ("expires_at");