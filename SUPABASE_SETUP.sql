-- ============================================================
-- SASYNA PLATFORM - Supabase Database Setup
-- Run this entire file in your Supabase SQL Editor:
-- Dashboard → SQL Editor → New query → paste & run
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DROP EXISTING TABLES (clean slate - safe re-run)
-- ============================================================
DROP TABLE IF EXISTS public.revisions CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.pricing_config CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin', 'superadmin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORDERS TABLE
-- ============================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id TEXT UNIQUE NOT NULL,
  student_id UUID NOT NULL REFERENCES auth.users(id),
  student_name TEXT,
  student_email TEXT,
  department TEXT NOT NULL,
  course_name TEXT NOT NULL,
  level_of_study TEXT NOT NULL,
  service_type TEXT NOT NULL,
  research_topic TEXT NOT NULL,
  research_objectives TEXT NOT NULL,
  additional_instructions TEXT,
  uploaded_file_url TEXT,
  uploaded_file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  assigned_admin_id UUID REFERENCES auth.users(id),
  assigned_admin_name TEXT,
  deposit_amount NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) DEFAULT 0,
  deposit_paid BOOLEAN DEFAULT FALSE,
  balance_paid BOOLEAN DEFAULT FALSE,
  deposit_reference TEXT,
  balance_reference TEXT,
  completed_file_url TEXT,
  completed_file_link TEXT,
  revised_file_url TEXT,
  revised_file_link TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS TABLE
-- ============================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id TEXT NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit', 'balance')),
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- REVISIONS TABLE
-- ============================================================
CREATE TABLE public.revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  order_display_id TEXT,
  student_id UUID NOT NULL REFERENCES auth.users(id),
  assigned_admin_id UUID REFERENCES auth.users(id),
  assigned_admin_name TEXT,
  description TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_response TEXT,
  corrected_file_url TEXT,
  corrected_file_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRICING CONFIG TABLE
-- ============================================================
CREATE TABLE public.pricing_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  research_project_price NUMERIC(10,2) DEFAULT 5000,
  research_proposal_price NUMERIC(10,2) DEFAULT 3000,
  deposit_percentage NUMERIC(5,2) DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pricing
INSERT INTO public.pricing_config (research_project_price, research_proposal_price, deposit_percentage)
VALUES (5000, 3000, 50);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- ── Profiles Policies ──
CREATE POLICY "service_role_all_profiles" ON public.profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ── Orders Policies ──
CREATE POLICY "service_role_all_orders" ON public.orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Payments Policies ──
CREATE POLICY "service_role_all_payments" ON public.payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Revisions Policies ──
CREATE POLICY "service_role_all_revisions" ON public.revisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Pricing Policies ──
CREATE POLICY "service_role_all_pricing" ON public.pricing_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_pricing" ON public.pricing_config
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP (Trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sasyna-files',
  'sasyna-files',
  false,
  52428800,
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','application/zip']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800;

-- Storage policies (drop and recreate cleanly)
DROP POLICY IF EXISTS "authenticated_upload_sasyna" ON storage.objects;
DROP POLICY IF EXISTS "service_role_storage_all" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_own" ON storage.objects;

CREATE POLICY "service_role_storage_all" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'sasyna-files') WITH CHECK (bucket_id = 'sasyna-files');

CREATE POLICY "authenticated_upload_sasyna" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sasyna-files');

CREATE POLICY "authenticated_read_own" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'sasyna-files');

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS columns
FROM information_schema.tables t
WHERE table_schema = 'public'
ORDER BY table_name;
