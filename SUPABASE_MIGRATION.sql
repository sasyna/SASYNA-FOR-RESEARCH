-- ============================================================
-- SASYNA PLATFORM - Database Migration
-- Run this in your Supabase SQL Editor to add missing columns and tables.
-- Safe to run multiple times (uses IF NOT EXISTS / DO $$ blocks).
-- ============================================================

-- ── profiles: add missing columns ──────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='phone_number') THEN
    ALTER TABLE public.profiles ADD COLUMN phone_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='national_id') THEN
    ALTER TABLE public.profiles ADD COLUMN national_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_balance') THEN
    ALTER TABLE public.profiles ADD COLUMN wallet_balance NUMERIC(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='pending_wallet') THEN
    ALTER TABLE public.profiles ADD COLUMN pending_wallet NUMERIC(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_type') THEN
    ALTER TABLE public.profiles ADD COLUMN wallet_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_mpesa_number') THEN
    ALTER TABLE public.profiles ADD COLUMN wallet_mpesa_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_bank_name') THEN
    ALTER TABLE public.profiles ADD COLUMN wallet_bank_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_bank_account_number') THEN
    ALTER TABLE public.profiles ADD COLUMN wallet_bank_account_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_bank_account_name') THEN
    ALTER TABLE public.profiles ADD COLUMN wallet_bank_account_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='name') THEN
    ALTER TABLE public.profiles ADD COLUMN name TEXT;
  END IF;
END $$;

-- ── orders: add missing columns ────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='student_phone_number') THEN
    ALTER TABLE public.orders ADD COLUMN student_phone_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='admin_share') THEN
    ALTER TABLE public.orders ADD COLUMN admin_share NUMERIC(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_option') THEN
    ALTER TABLE public.orders ADD COLUMN payment_option TEXT DEFAULT 'deposit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='completed_file_link') THEN
    ALTER TABLE public.orders ADD COLUMN completed_file_link TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='revised_file_link') THEN
    ALTER TABLE public.orders ADD COLUMN revised_file_link TEXT;
  END IF;
END $$;

-- ── level_pricing table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.level_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level TEXT UNIQUE NOT NULL,
  research_project_price NUMERIC(10,2) DEFAULT 5000,
  research_proposal_price NUMERIC(10,2) DEFAULT 3000,
  deposit_percentage NUMERIC(5,2) DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'level_pricing' AND policyname = 'service_role_all_level_pricing'
  ) THEN
    ALTER TABLE public.level_pricing ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all_level_pricing" ON public.level_pricing FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "authenticated_read_level_pricing" ON public.level_pricing FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Insert default levels
INSERT INTO public.level_pricing (level, research_project_price, research_proposal_price, deposit_percentage) VALUES
  ('Certificate', 4000, 2500, 50),
  ('Diploma', 5000, 3000, 50),
  ('Higher Diploma', 6000, 3500, 50),
  ('Degree', 7000, 4000, 50),
  ('Masters', 10000, 6000, 50),
  ('PhD', 15000, 8000, 50)
ON CONFLICT (level) DO NOTHING;

-- ── withdrawal_requests table ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  admin_name TEXT,
  admin_email TEXT,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  superadmin_notes TEXT,
  mpesa_number TEXT,
  wallet_type TEXT,
  wallet_mpesa_number TEXT,
  wallet_bank_name TEXT,
  wallet_bank_account_number TEXT,
  wallet_bank_account_name TEXT,
  national_id TEXT,
  phone_number TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'withdrawal_requests' AND policyname = 'service_role_all_withdrawal_requests'
  ) THEN
    ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all_withdrawal_requests" ON public.withdrawal_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── withdrawal_settings table ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.withdrawal_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  withdrawal_day INTEGER DEFAULT 4,
  open_hour INTEGER DEFAULT 8,
  close_hour INTEGER DEFAULT 17,
  is_open BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'withdrawal_settings' AND policyname = 'service_role_all_withdrawal_settings'
  ) THEN
    ALTER TABLE public.withdrawal_settings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all_withdrawal_settings" ON public.withdrawal_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.withdrawal_settings (withdrawal_day, open_hour, close_hour, is_open)
SELECT 4, 8, 17, true
WHERE NOT EXISTS (SELECT 1 FROM public.withdrawal_settings);

-- ── refund_history table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refund_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id),
  order_display_id TEXT,
  student_id UUID,
  student_name TEXT,
  student_email TEXT,
  amount NUMERIC(12,2) NOT NULL,
  approved_by UUID,
  approved_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'refund_history' AND policyname = 'service_role_all_refund_history'
  ) THEN
    ALTER TABLE public.refund_history ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all_refund_history" ON public.refund_history FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── notifications table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID REFERENCES auth.users(id),
  sender_name TEXT,
  sender_role TEXT,
  recipient_id UUID REFERENCES auth.users(id),
  recipient_email TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_public BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'service_role_all_notifications'
  ) THEN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all_notifications" ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── pricing_config table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  research_project_price NUMERIC(10,2) DEFAULT 1500,
  research_proposal_price NUMERIC(10,2) DEFAULT 1000,
  deposit_percentage NUMERIC(5,2) DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pricing_config' AND policyname = 'service_role_all_pricing_config'
  ) THEN
    ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all_pricing_config" ON public.pricing_config FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "authenticated_read_pricing_config" ON public.pricing_config FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO public.pricing_config (research_project_price, research_proposal_price, deposit_percentage)
SELECT 1500, 1000, 50
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_config);

-- ── revisions table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id),
  order_display_id TEXT,
  student_id UUID REFERENCES auth.users(id),
  assigned_admin_id UUID REFERENCES auth.users(id),
  assigned_admin_name TEXT,
  description TEXT NOT NULL,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_response TEXT,
  corrected_file_url TEXT,
  corrected_file_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'revisions' AND policyname = 'service_role_all_revisions'
  ) THEN
    ALTER TABLE public.revisions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all_revisions" ON public.revisions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Update handle_new_user trigger to include phone_number ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, phone_number, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email       = EXCLUDED.email,
    full_name   = COALESCE(EXCLUDED.full_name, profiles.full_name),
    phone       = COALESCE(EXCLUDED.phone, profiles.phone),
    role        = COALESCE(EXCLUDED.role, profiles.role),
    updated_at  = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
