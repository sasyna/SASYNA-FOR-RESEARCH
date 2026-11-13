import { supabase } from "./supabase.js";

export async function ensureTablesExist() {
  // Try creating/seeding core tables via upsert patterns
  // The actual SQL needs to be run in Supabase dashboard if tables don't exist
  // This just validates connectivity
  try {
    await supabase.from("profiles").select("id").limit(1);
    console.log("[DB] profiles table OK");
  } catch (e) {
    console.error("[DB] profiles table missing:", e);
  }
}

export function getMigrationSQL(): string {
  return `
-- ============================================================
-- Sasyna Platform - Database Migrations
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Ensure profiles table has all necessary columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_type text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_mpesa_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_bank_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_bank_account_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_bank_account_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pending_wallet numeric DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0;

-- 2. Ensure orders table has all necessary columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_option text DEFAULT 'deposit';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_share numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_file_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_file_link text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS revised_file_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS revised_file_link text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_reference text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_reference text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS student_phone_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS student_email text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS uploaded_file_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS uploaded_file_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_file_storage_path text;

-- 4b. Proposal recycle bin
CREATE TABLE IF NOT EXISTS proposal_recycle_bin (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL,
  order_display_id text NOT NULL,
  student_name text,
  student_email text,
  file_path text NOT NULL,
  file_name text,
  service_type text,
  order_status text,
  deleted_at timestamptz DEFAULT now(),
  deleted_by_id text,
  deleted_by_name text
);

-- 3. Revisions table
CREATE TABLE IF NOT EXISTS revisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid,
  order_display_id text,
  student_id uuid,
  assigned_admin_id uuid,
  assigned_admin_name text,
  description text NOT NULL,
  file_url text,
  status text DEFAULT 'pending',
  admin_response text,
  corrected_file_url text,
  corrected_file_link text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Disable RLS on revisions (or add appropriate policies)
ALTER TABLE revisions DISABLE ROW LEVEL SECURITY;

-- 4. Withdrawal requests table
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid,
  admin_name text,
  admin_email text,
  amount numeric DEFAULT 0,
  status text DEFAULT 'pending',
  wallet_type text,
  wallet_mpesa_number text,
  wallet_bank_name text,
  wallet_bank_account_number text,
  wallet_bank_account_name text,
  mpesa_number text,
  notes text,
  superadmin_notes text,
  requested_at timestamptz,
  processed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE withdrawal_requests DISABLE ROW LEVEL SECURITY;

-- 5. Withdrawal settings table
CREATE TABLE IF NOT EXISTS withdrawal_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  withdrawal_day integer DEFAULT 4,
  open_hour integer DEFAULT 8,
  close_hour integer DEFAULT 17,
  is_open boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE withdrawal_settings DISABLE ROW LEVEL SECURITY;
INSERT INTO withdrawal_settings (withdrawal_day, open_hour, close_hour, is_open)
SELECT 4, 8, 17, true WHERE NOT EXISTS (SELECT 1 FROM withdrawal_settings);

-- 6. Level pricing table (replaces single pricing_config for per-level pricing)
CREATE TABLE IF NOT EXISTS level_pricing (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL UNIQUE,
  research_project_price numeric DEFAULT 1500,
  research_proposal_price numeric DEFAULT 1500,
  deposit_percentage numeric DEFAULT 50,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE level_pricing DISABLE ROW LEVEL SECURITY;
INSERT INTO level_pricing (level, research_project_price, research_proposal_price, deposit_percentage)
VALUES
  ('Certificate', 1500, 1000, 50),
  ('Diploma', 2000, 1500, 50),
  ('Higher Diploma', 2500, 2000, 50),
  ('Upgrading', 3000, 2000, 50),
  ('Undergraduate', 3500, 2500, 50),
  ('Masters', 5000, 3500, 50)
ON CONFLICT (level) DO NOTHING;

-- 7. Global pricing config (fallback / deposit percentage only)
CREATE TABLE IF NOT EXISTS pricing_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  research_project_price numeric DEFAULT 1500,
  research_proposal_price numeric DEFAULT 1500,
  deposit_percentage numeric DEFAULT 50,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE pricing_config DISABLE ROW LEVEL SECURITY;

-- 8. Payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id text,
  reference text UNIQUE,
  amount numeric,
  payment_type text,
  status text DEFAULT 'pending',
  email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

-- 9. Refund history table
CREATE TABLE IF NOT EXISTS refund_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid,
  order_display_id text,
  student_id uuid,
  student_name text,
  student_email text,
  amount numeric,
  approved_by uuid,
  approved_by_name text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE refund_history DISABLE ROW LEVEL SECURITY;

-- Done!
SELECT 'Migration complete' as status;
`.trim();
}
