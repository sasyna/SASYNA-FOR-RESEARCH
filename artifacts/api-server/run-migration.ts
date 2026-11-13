import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Run each statement separately via rpc
const statements = [
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_wallet NUMERIC(10,2) DEFAULT 0`,
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) DEFAULT 0`,
  `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_share NUMERIC(10,2) DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES auth.users(id),
    admin_name TEXT,
    admin_email TEXT,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    mpesa_number TEXT,
    notes TEXT,
    superadmin_notes TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='withdrawal_requests' AND policyname='service_role_withdrawals') THEN
      CREATE POLICY "service_role_withdrawals" ON public.withdrawal_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='withdrawal_requests' AND policyname='admin_own_withdrawals') THEN
      CREATE POLICY "admin_own_withdrawals" ON public.withdrawal_requests FOR ALL TO authenticated USING (admin_id = auth.uid());
    END IF;
  END $$`,
];

for (const sql of statements) {
  const { error } = await supabase.rpc("exec_sql", { sql }).catch(() => ({ error: null }));
  // Try direct approach via postgrest
}

// Use raw SQL via the REST API
const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`;
// Instead, let's use the pg approach - insert a row to check if columns exist
const { data: profileCols, error: e1 } = await supabase.from("profiles").select("pending_wallet").limit(1);
if (e1?.message?.includes("column") || e1?.code === "42703") {
  console.log("❌ Wallet columns not yet added - need to run SQL manually");
} else {
  console.log("✓ pending_wallet column exists");
}

const { data: wrCheck, error: e2 } = await supabase.from("withdrawal_requests").select("id").limit(1);
if (e2?.code === "42P01") {
  console.log("❌ withdrawal_requests table not yet created - need to run SQL manually");
} else {
  console.log("✓ withdrawal_requests table exists");
}
