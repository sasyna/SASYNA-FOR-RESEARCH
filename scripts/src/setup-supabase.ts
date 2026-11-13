import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SUPABASE_PROJECT_REF = supabaseUrl.replace("https://", "").split(".")[0];

async function runSql(sql: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: text };
  }
  return { success: true };
}

async function main() {
  console.log("Setting up Supabase tables...");
  console.log("Project ref:", SUPABASE_PROJECT_REF);

  const statements = [
    `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

    `CREATE TABLE IF NOT EXISTS public.profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      full_name TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin', 'superadmin')),
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS public.orders (
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
    )`,

    `CREATE TABLE IF NOT EXISTS public.payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id TEXT NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit', 'balance')),
      amount NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS public.revisions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
      order_display_id TEXT,
      student_id UUID NOT NULL REFERENCES auth.users(id),
      description TEXT NOT NULL,
      file_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_response TEXT,
      corrected_file_url TEXT,
      corrected_file_link TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS public.pricing_config (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      research_project_price NUMERIC(10,2) DEFAULT 500,
      research_proposal_price NUMERIC(10,2) DEFAULT 300,
      deposit_percentage NUMERIC(5,2) DEFAULT 50,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `INSERT INTO public.pricing_config (research_project_price, research_proposal_price, deposit_percentage)
     SELECT 500, 300, 50
     WHERE NOT EXISTS (SELECT 1 FROM public.pricing_config)`,

    `ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.revisions ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_service_role') THEN
        CREATE POLICY profiles_service_role ON public.profiles FOR ALL TO service_role USING (true);
      END IF;
    END $$`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'users_own_profile') THEN
        CREATE POLICY users_own_profile ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
      END IF;
    END $$`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'users_insert_profile') THEN
        CREATE POLICY users_insert_profile ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
      END IF;
    END $$`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'users_update_profile') THEN
        CREATE POLICY users_update_profile ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
      END IF;
    END $$`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_service_role') THEN
        CREATE POLICY orders_service_role ON public.orders FOR ALL TO service_role USING (true);
      END IF;
    END $$`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'payments_service_role') THEN
        CREATE POLICY payments_service_role ON public.payments FOR ALL TO service_role USING (true);
      END IF;
    END $$`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revisions' AND policyname = 'revisions_service_role') THEN
        CREATE POLICY revisions_service_role ON public.revisions FOR ALL TO service_role USING (true);
      END IF;
    END $$`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pricing_config' AND policyname = 'pricing_service_role') THEN
        CREATE POLICY pricing_service_role ON public.pricing_config FOR ALL TO service_role USING (true);
      END IF;
    END $$`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pricing_config' AND policyname = 'pricing_auth_read') THEN
        CREATE POLICY pricing_auth_read ON public.pricing_config FOR SELECT TO authenticated USING (true);
      END IF;
    END $$`,

    `CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $func$
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
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, profiles.phone),
        role = COALESCE(EXCLUDED.role, profiles.role),
        updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql SECURITY DEFINER`,

    `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users`,

    `CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`,
  ];

  let success = 0;
  let failed = 0;

  for (const sql of statements) {
    const result = await runSql(sql);
    if (result.success) {
      success++;
      console.log("✓ Executed:", sql.substring(0, 60).replace(/\n/g, " ") + "...");
    } else {
      failed++;
      console.error("✗ Failed:", sql.substring(0, 60).replace(/\n/g, " ") + "...");
      console.error("  Error:", result.error);
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed`);

  // Verify tables exist
  console.log("\nVerifying tables...");
  const tables = ["profiles", "orders", "payments", "revisions", "pricing_config"];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      console.error(`✗ ${table}: ${error.message}`);
    } else {
      console.log(`✓ ${table}: accessible`);
    }
  }
}

main().catch(console.error);
