-- ONDC Platform Database Initialization
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create database if not exists (run as superuser)
-- CREATE DATABASE ondc;

-- Types
CREATE TYPE subscriber_type AS ENUM ('BAP', 'BPP', 'BG');
CREATE TYPE subscriber_status AS ENUM ('INITIATED', 'UNDER_SUBSCRIPTION', 'SUBSCRIBED', 'SUSPENDED', 'REVOKED');
CREATE TYPE transaction_status AS ENUM ('SENT', 'ACK', 'NACK', 'CALLBACK_RECEIVED', 'TIMEOUT', 'ERROR');
CREATE TYPE admin_role AS ENUM ('SUPER_ADMIN', 'ADMIN', 'VIEWER');
CREATE TYPE simulation_status AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- Subscribers
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscriber_id TEXT UNIQUE NOT NULL,
  subscriber_url TEXT NOT NULL,
  type subscriber_type NOT NULL,
  domain TEXT,
  city TEXT,
  signing_public_key TEXT NOT NULL,
  encr_public_key TEXT,
  unique_key_id TEXT NOT NULL,
  status subscriber_status NOT NULL DEFAULT 'INITIATED',
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  webhook_url TEXT,
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Domains
CREATE TABLE IF NOT EXISTS domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  schema_version TEXT DEFAULT '1.1.0',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cities
CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  state TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  action TEXT NOT NULL,
  bap_id TEXT,
  bpp_id TEXT,
  domain TEXT,
  city TEXT,
  request_body JSONB,
  response_body JSONB,
  status transaction_status NOT NULL DEFAULT 'SENT',
  error JSONB,
  latency_ms INTEGER,
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_transaction_id ON transactions(transaction_id);
CREATE INDEX idx_transactions_message_id ON transactions(message_id);
CREATE INDEX idx_transactions_bap_id ON transactions(bap_id);
CREATE INDEX idx_transactions_bpp_id ON transactions(bpp_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role admin_role NOT NULL DEFAULT 'VIEWER',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- Network Policies
CREATE TABLE IF NOT EXISTS network_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain TEXT,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Simulation Runs
CREATE TABLE IF NOT EXISTS simulation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  config JSONB NOT NULL,
  stats JSONB,
  status simulation_status NOT NULL DEFAULT 'RUNNING'
);

-- ============================================
-- Vault Tables
-- ============================================

CREATE TYPE secret_status AS ENUM ('ACTIVE', 'ROTATING', 'REVOKED');

CREATE TABLE IF NOT EXISTS vault_secrets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  encrypted_value TEXT NOT NULL,
  previous_encrypted_value TEXT,
  service TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  rotation_interval_seconds INTEGER,
  status secret_status NOT NULL DEFAULT 'ACTIVE',
  last_rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scope JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vault_tokens_service_id ON vault_tokens(service_id);
CREATE INDEX idx_vault_tokens_expires_at ON vault_tokens(expires_at);

CREATE TABLE IF NOT EXISTS rotation_hooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  secret_name TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  headers JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Health Monitor Tables
-- ============================================

CREATE TYPE alert_severity AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE alert_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE IF NOT EXISTS health_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  details JSONB,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_snapshots_service ON health_snapshots(service);
CREATE INDEX idx_health_snapshots_checked_at ON health_snapshots(checked_at);

CREATE TABLE IF NOT EXISTS health_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service TEXT NOT NULL,
  severity alert_severity NOT NULL,
  status alert_status NOT NULL DEFAULT 'OPEN',
  message TEXT NOT NULL,
  details JSONB,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_alerts_service ON health_alerts(service);
CREATE INDEX idx_health_alerts_status ON health_alerts(status);
CREATE INDEX idx_health_alerts_created_at ON health_alerts(created_at);

-- ============================================
-- Log Aggregator Tables
-- ============================================

CREATE TABLE IF NOT EXISTS aggregated_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aggregated_logs_service ON aggregated_logs(service);
CREATE INDEX idx_aggregated_logs_level ON aggregated_logs(level);
CREATE INDEX idx_aggregated_logs_timestamp ON aggregated_logs(timestamp);

-- ============================================
-- Orchestrator Tables
-- ============================================

CREATE TYPE teardown_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

CREATE TABLE IF NOT EXISTS teardown_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  status teardown_status NOT NULL DEFAULT 'PENDING',
  progress INTEGER NOT NULL DEFAULT 0,
  steps_completed JSONB,
  error TEXT,
  initiated_by TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- Orders Table (Order State Machine)
-- ============================================

CREATE TYPE order_state AS ENUM ('CREATED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RETURNED');

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id TEXT UNIQUE NOT NULL,
  transaction_id TEXT NOT NULL,
  bap_id TEXT NOT NULL,
  bpp_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  city TEXT NOT NULL,
  state order_state NOT NULL DEFAULT 'CREATED',
  provider JSONB,
  items JSONB,
  billing JSONB,
  fulfillments JSONB,
  quote JSONB,
  payment JSONB,
  cancellation_reason_code TEXT,
  cancelled_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_order_id ON orders(order_id);
CREATE INDEX idx_orders_transaction_id ON orders(transaction_id);
CREATE INDEX idx_orders_bap_id ON orders(bap_id);
CREATE INDEX idx_orders_bpp_id ON orders(bpp_id);
CREATE INDEX idx_orders_state ON orders(state);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Order state transition history
CREATE TABLE IF NOT EXISTS order_state_transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id TEXT NOT NULL REFERENCES orders(order_id),
  from_state order_state,
  to_state order_state NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_state_transitions_order_id ON order_state_transitions(order_id);

-- ============================================
-- IGM (Issue & Grievance Management) Tables
-- ============================================

CREATE TYPE issue_status AS ENUM ('OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED');
CREATE TYPE issue_category AS ENUM ('ORDER', 'ITEM', 'FULFILLMENT', 'AGENT');

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id TEXT UNIQUE NOT NULL,
  transaction_id TEXT NOT NULL,
  order_id TEXT,
  bap_id TEXT NOT NULL,
  bpp_id TEXT NOT NULL,
  category issue_category NOT NULL,
  sub_category TEXT NOT NULL,
  status issue_status NOT NULL DEFAULT 'OPEN',
  short_desc TEXT NOT NULL,
  long_desc TEXT,
  complainant_info JSONB,
  respondent_actions JSONB DEFAULT '[]'::jsonb,
  resolution JSONB,
  resolution_provider JSONB,
  expected_response_time TIMESTAMPTZ,
  expected_resolution_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issues_issue_id ON issues(issue_id);
CREATE INDEX idx_issues_transaction_id ON issues(transaction_id);
CREATE INDEX idx_issues_order_id ON issues(order_id);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_created_at ON issues(created_at);

-- ============================================
-- RSP (Reconciliation & Settlement) Tables
-- ============================================

CREATE TYPE settlement_status AS ENUM ('PAID', 'NOT_PAID', 'PENDING');
CREATE TYPE recon_status AS ENUM ('01_MATCHED', '02_UNMATCHED', '03_DISPUTED', '04_OVERPAID', '05_UNDERPAID');

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  collector_app_id TEXT NOT NULL,
  receiver_app_id TEXT NOT NULL,
  settlement_type TEXT NOT NULL,
  settlement_status settlement_status NOT NULL DEFAULT 'PENDING',
  settlement_amount DECIMAL(12,2) NOT NULL,
  settlement_currency TEXT NOT NULL DEFAULT 'INR',
  settlement_reference TEXT,
  settlement_timestamp TIMESTAMPTZ,
  buyer_finder_fee_type TEXT,
  buyer_finder_fee_amount DECIMAL(12,2),
  withholding_amount DECIMAL(12,2),
  settlement_counterparty TEXT,
  settlement_phase TEXT,
  settlement_bank_account_no TEXT,
  settlement_ifsc_code TEXT,
  upi_address TEXT,
  recon_status recon_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlements_transaction_id ON settlements(transaction_id);
CREATE INDEX idx_settlements_order_id ON settlements(order_id);
CREATE INDEX idx_settlements_settlement_status ON settlements(settlement_status);

-- ============================================
-- Ratings Tables
-- ============================================

CREATE TYPE rating_category AS ENUM ('ORDER', 'ITEM', 'FULFILLMENT', 'AGENT', 'PROVIDER');

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rating_id TEXT UNIQUE NOT NULL,
  transaction_id TEXT NOT NULL,
  order_id TEXT,
  bap_id TEXT NOT NULL,
  bpp_id TEXT NOT NULL,
  rating_category rating_category NOT NULL,
  rated_entity_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 1 AND value <= 5),
  feedback_form JSONB,
  feedback_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ratings_transaction_id ON ratings(transaction_id);
CREATE INDEX idx_ratings_order_id ON ratings(order_id);
CREATE INDEX idx_ratings_bpp_id ON ratings(bpp_id);
CREATE INDEX idx_ratings_rated_entity_id ON ratings(rated_entity_id);
CREATE INDEX idx_ratings_rating_category ON ratings(rating_category);

-- ============================================
-- Multi-Domain Subscriber Support
-- ============================================

CREATE TABLE IF NOT EXISTS subscriber_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscriber_id TEXT NOT NULL REFERENCES subscribers(subscriber_id),
  domain TEXT NOT NULL,
  city TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subscriber_id, domain, city)
);

CREATE INDEX idx_subscriber_domains_subscriber_id ON subscriber_domains(subscriber_id);
CREATE INDEX idx_subscriber_domains_domain ON subscriber_domains(domain);
CREATE INDEX idx_subscriber_domains_domain_city ON subscriber_domains(domain, city);

-- ============================================
-- Seed: ONDC Official Domain Codes
-- ============================================
-- As per ONDC Registry: https://ondc.org/network-domains

INSERT INTO domains (code, name, description, schema_version) VALUES
  -- Retail domains
  ('ONDC:RET10', 'Grocery', 'Grocery & staples, fresh fruits/vegetables, dairy', '1.2.0'),
  ('ONDC:RET11', 'F&B', 'Food & Beverage – restaurants, cloud kitchens', '1.2.0'),
  ('ONDC:RET12', 'Fashion', 'Apparel, footwear, accessories', '1.2.0'),
  ('ONDC:RET13', 'BPC', 'Beauty & Personal Care products', '1.2.0'),
  ('ONDC:RET14', 'Electronics', 'Electronics & appliances', '1.2.0'),
  ('ONDC:RET15', 'Appliances', 'Home appliances & kitchen equipment', '1.2.0'),
  ('ONDC:RET16', 'Home & Kitchen', 'Home & kitchen décor, furnishings', '1.2.0'),
  ('ONDC:RET17', 'Pharma', 'Pharmaceutical products & OTC medicine', '1.2.0'),
  ('ONDC:RET18', 'Health & Wellness', 'Health supplements, fitness products', '1.2.0'),
  ('ONDC:RET19', 'Agriculture', 'Agriculture inputs, seeds, fertilisers', '1.2.0'),
  ('ONDC:RET20', 'Toys & Games', 'Toys, games, hobby supplies', '1.2.0'),
  -- Logistics domain
  ('ONDC:LOG10', 'Domestic Logistics', 'Intra-city & inter-city logistics fulfillment', '1.2.0'),
  ('ONDC:LOG11', 'International Logistics', 'Cross-border logistics & shipping', '1.2.0'),
  -- Services domains
  ('ONDC:SRV11', 'Healthcare Services', 'Teleconsultation, diagnostics, lab tests', '1.2.0'),
  ('ONDC:SRV13', 'Education Services', 'EdTech, courses, certifications', '1.2.0'),
  ('ONDC:SRV14', 'Agriculture Services', 'Agri advisory, soil testing, drone spraying', '1.2.0'),
  ('ONDC:SRV16', 'Skilling Services', 'Professional training, vocational skilling', '1.2.0'),
  ('ONDC:SRV17', 'Financial Services', 'Insurance, mutual funds, credit', '1.2.0'),
  ('ONDC:SRV18', 'Home Services', 'Plumbing, electrical, cleaning, repair', '1.2.0'),
  -- Mobility domains
  ('ONDC:TRV10', 'Mobility', 'Cab rides, auto rides, bike taxis', '1.2.0'),
  ('ONDC:TRV11', 'Metro & Transit', 'Metro, bus, rail ticketing', '1.2.0'),
  -- Financial Services
  ('ONDC:FIS12', 'Mutual Funds', 'Mutual fund distribution & transactions', '1.2.0'),
  ('ONDC:FIS13', 'Insurance', 'General & life insurance products', '1.2.0'),
  ('ONDC:FIS14', 'Credit', 'Personal loans, business loans, credit lines', '1.2.0')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- Seed: Indian City STD Codes (ONDC Format)
-- ============================================
-- ONDC uses "std:XXX" format for city codes based on Indian STD telephone codes.
-- This covers all major cities and state capitals.

INSERT INTO cities (code, name, state) VALUES
  -- Metro cities
  ('std:011', 'Delhi', 'Delhi'),
  ('std:022', 'Mumbai', 'Maharashtra'),
  ('std:033', 'Kolkata', 'West Bengal'),
  ('std:044', 'Chennai', 'Tamil Nadu'),
  ('std:080', 'Bengaluru', 'Karnataka'),
  ('std:040', 'Hyderabad', 'Telangana'),
  ('std:079', 'Ahmedabad', 'Gujarat'),
  ('std:020', 'Pune', 'Maharashtra'),
  -- North India
  ('std:0120', 'Noida', 'Uttar Pradesh'),
  ('std:0121', 'Ghaziabad', 'Uttar Pradesh'),
  ('std:0124', 'Gurugram', 'Haryana'),
  ('std:0129', 'Faridabad', 'Haryana'),
  ('std:0522', 'Lucknow', 'Uttar Pradesh'),
  ('std:0512', 'Kanpur', 'Uttar Pradesh'),
  ('std:0562', 'Agra', 'Uttar Pradesh'),
  ('std:0542', 'Varanasi', 'Uttar Pradesh'),
  ('std:0532', 'Allahabad (Prayagraj)', 'Uttar Pradesh'),
  ('std:0581', 'Bareilly', 'Uttar Pradesh'),
  ('std:0551', 'Gorakhpur', 'Uttar Pradesh'),
  ('std:0161', 'Ludhiana', 'Punjab'),
  ('std:0172', 'Chandigarh', 'Chandigarh'),
  ('std:0183', 'Jalandhar', 'Punjab'),
  ('std:0175', 'Patiala', 'Punjab'),
  ('std:0181', 'Amritsar', 'Punjab'),
  ('std:0141', 'Jaipur', 'Rajasthan'),
  ('std:0291', 'Jodhpur', 'Rajasthan'),
  ('std:0294', 'Udaipur', 'Rajasthan'),
  ('std:0145', 'Ajmer', 'Rajasthan'),
  ('std:0151', 'Bikaner', 'Rajasthan'),
  ('std:0144', 'Kota', 'Rajasthan'),
  ('std:0135', 'Dehradun', 'Uttarakhand'),
  ('std:01332', 'Haridwar', 'Uttarakhand'),
  ('std:0177', 'Shimla', 'Himachal Pradesh'),
  ('std:0194', 'Srinagar', 'Jammu & Kashmir'),
  ('std:0191', 'Jammu', 'Jammu & Kashmir'),
  -- West India
  ('std:0261', 'Surat', 'Gujarat'),
  ('std:0265', 'Vadodara', 'Gujarat'),
  ('std:0281', 'Rajkot', 'Gujarat'),
  ('std:0253', 'Nashik', 'Maharashtra'),
  ('std:0712', 'Nagpur', 'Maharashtra'),
  ('std:0240', 'Aurangabad (Chhatrapati Sambhajinagar)', 'Maharashtra'),
  ('std:0231', 'Solapur', 'Maharashtra'),
  ('std:0230', 'Kolhapur', 'Maharashtra'),
  ('std:0832', 'Panaji', 'Goa'),
  -- South India
  ('std:0471', 'Thiruvananthapuram', 'Kerala'),
  ('std:0484', 'Kochi', 'Kerala'),
  ('std:0495', 'Kozhikode', 'Kerala'),
  ('std:0487', 'Thrissur', 'Kerala'),
  ('std:0422', 'Coimbatore', 'Tamil Nadu'),
  ('std:0452', 'Madurai', 'Tamil Nadu'),
  ('std:0413', 'Pondicherry', 'Puducherry'),
  ('std:0416', 'Vellore', 'Tamil Nadu'),
  ('std:0431', 'Tiruchirappalli', 'Tamil Nadu'),
  ('std:0462', 'Tirunelveli', 'Tamil Nadu'),
  ('std:0821', 'Mysuru', 'Karnataka'),
  ('std:0824', 'Mangaluru', 'Karnataka'),
  ('std:0836', 'Hubli-Dharwad', 'Karnataka'),
  ('std:0831', 'Belgaum (Belagavi)', 'Karnataka'),
  ('std:0816', 'Udupi', 'Karnataka'),
  ('std:0866', 'Vijayawada', 'Andhra Pradesh'),
  ('std:0891', 'Visakhapatnam', 'Andhra Pradesh'),
  ('std:0863', 'Guntur', 'Andhra Pradesh'),
  ('std:0877', 'Tirupati', 'Andhra Pradesh'),
  ('std:0884', 'Rajahmundry', 'Andhra Pradesh'),
  ('std:08518', 'Kurnool', 'Andhra Pradesh'),
  -- East India
  ('std:0612', 'Patna', 'Bihar'),
  ('std:0631', 'Gaya', 'Bihar'),
  ('std:0651', 'Ranchi', 'Jharkhand'),
  ('std:0657', 'Jamshedpur', 'Jharkhand'),
  ('std:0674', 'Bhubaneswar', 'Odisha'),
  ('std:0671', 'Cuttack', 'Odisha'),
  ('std:0680', 'Rourkela', 'Odisha'),
  -- Central India
  ('std:0755', 'Bhopal', 'Madhya Pradesh'),
  ('std:0731', 'Indore', 'Madhya Pradesh'),
  ('std:0761', 'Jabalpur', 'Madhya Pradesh'),
  ('std:0751', 'Gwalior', 'Madhya Pradesh'),
  ('std:0771', 'Raipur', 'Chhattisgarh'),
  ('std:0788', 'Bilaspur', 'Chhattisgarh'),
  -- Northeast India
  ('std:0361', 'Guwahati', 'Assam'),
  ('std:0364', 'Silchar', 'Assam'),
  ('std:0381', 'Agartala', 'Tripura'),
  ('std:0389', 'Shillong', 'Meghalaya'),
  ('std:0385', 'Imphal', 'Manipur'),
  ('std:0370', 'Kohima', 'Nagaland'),
  ('std:0360', 'Itanagar', 'Arunachal Pradesh'),
  ('std:03592', 'Gangtok', 'Sikkim'),
  -- Special: Pan-India / All Cities
  ('std:*', 'All Cities (Pan-India)', NULL)
ON CONFLICT (code) DO NOTHING;
