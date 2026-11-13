import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const email = "donnahfreak@gmail.com";
const password = "0110666178";

const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
if (listError) { console.error(listError.message); process.exit(1); }

const existing = users?.find(u => u.email === email);
let userId: string;

if (existing) {
  console.log("User exists:", existing.id);
  userId = existing.id;
  const { error } = await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  if (error) console.error("Password update error:", error.message);
  else console.log("Password updated ✓");
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true
  });
  if (error || !data?.user) { console.error(error?.message); process.exit(1); }
  userId = data.user.id;
  console.log("User created:", userId);
}

const { error: profileError } = await supabase.from("profiles").upsert({
  id: userId, email, full_name: "Super Admin", role: "superadmin",
  updated_at: new Date().toISOString()
}, { onConflict: "id" });

if (profileError) console.error("Profile error:", profileError.message);
else console.log("Role set to superadmin ✓");

console.log("\n✅ Super Admin ready: donnahfreak@gmail.com / 0110666178");
