CREATE TYPE "public"."nocs_txn_status" AS ENUM('INITIATED', 'PENDING', 'SETTLED', 'FAILED', 'DISPUTED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."settlement_basis" AS ENUM('collection', 'shipment', 'delivery', 'return_window');--> statement-breakpoint
CREATE TABLE "escalation_timers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" text NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"escalation_deadline" timestamp with time zone NOT NULL,
	"escalated" boolean DEFAULT false,
	"escalated_at" timestamp with time zone,
	"acknowledged" boolean DEFAULT false,
	"acknowledged_at" timestamp with time zone,
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "logistics_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retail_order_id" text NOT NULL,
	"logistics_transaction_id" text NOT NULL,
	"lsp_subscriber_id" text,
	"lsp_provider_id" text,
	"lsp_order_id" text,
	"pickup_address" jsonb,
	"delivery_address" jsonb,
	"package_weight" numeric(10, 3),
	"package_dimensions" jsonb,
	"estimated_pickup" timestamp with time zone,
	"estimated_delivery" timestamp with time zone,
	"actual_pickup" timestamp with time zone,
	"actual_delivery" timestamp with time zone,
	"tracking_url" text,
	"shipping_label_url" text,
	"awb_number" text,
	"state" text DEFAULT 'SEARCHING',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "logistics_orders_logistics_transaction_id_unique" UNIQUE("logistics_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "nbbl_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" text NOT NULL,
	"settlement_account_no" text NOT NULL,
	"settlement_ifsc" text NOT NULL,
	"settlement_bank_name" text NOT NULL,
	"virtual_payment_address" text,
	"nocs_onboarded" boolean DEFAULT false,
	"settlement_agency_id" text,
	"registered_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "nbbl_registrations_subscriber_id_unique" UNIQUE("subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "settlement_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"collector_subscriber_id" text NOT NULL,
	"receiver_subscriber_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'INR',
	"settlement_basis" "settlement_basis" NOT NULL,
	"settlement_window_start" timestamp with time zone,
	"settlement_due_date" timestamp with time zone,
	"withholding_amount" numeric(12, 2) DEFAULT '0',
	"finder_fee_amount" numeric(12, 2) DEFAULT '0',
	"platform_fee_amount" numeric(12, 2) DEFAULT '0',
	"net_payable" numeric(12, 2) NOT NULL,
	"status" "nocs_txn_status" DEFAULT 'INITIATED',
	"settlement_reference" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "withholding_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"collector_subscriber_id" text NOT NULL,
	"withheld_amount" numeric(12, 2) NOT NULL,
	"release_date" timestamp with time zone NOT NULL,
	"released" boolean DEFAULT false NOT NULL,
	"released_at" timestamp with time zone,
	"refund_used" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "vault_secrets" ALTER COLUMN "version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "logistics_orders" ADD CONSTRAINT "logistics_orders_retail_order_id_orders_order_id_fk" FOREIGN KEY ("retail_order_id") REFERENCES "public"."orders"("order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_et_issue_id" ON "escalation_timers" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_et_deadline" ON "escalation_timers" USING btree ("escalation_deadline");--> statement-breakpoint
CREATE INDEX "idx_lo_retail_order" ON "logistics_orders" USING btree ("retail_order_id");--> statement-breakpoint
CREATE INDEX "idx_lo_lsp_order" ON "logistics_orders" USING btree ("lsp_order_id");--> statement-breakpoint
CREATE INDEX "idx_lo_state" ON "logistics_orders" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_si_order_id" ON "settlement_instructions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_si_collector" ON "settlement_instructions" USING btree ("collector_subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_si_receiver" ON "settlement_instructions" USING btree ("receiver_subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_si_status" ON "settlement_instructions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_wp_order_id" ON "withholding_pool" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_wp_release" ON "withholding_pool" USING btree ("release_date");