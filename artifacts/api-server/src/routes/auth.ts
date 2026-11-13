import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

router.get("/auth/me", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, phone, avatar_url")
    .eq("id", userId)
    .single();
  if (error || !profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json({
    id: profile.id,
    email: profile.email,
    name: profile.full_name,
    role: profile.role,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
  });
});

router.post("/auth/register", async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body;

    if (!email || !password || !fullName) {
      res.status(400).json({ error: "Email, password, and name are required" });
      return;
    }

    // SECURITY: role is ALWAYS 'student' on self-registration.
    // Admin/superadmin accounts can only be created via the superadmin panel
    // using the service_role key — never through this public endpoint.
    const role = "student";

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone ?? "",
        // Note: role in metadata is ignored by our DB trigger (hardcoded to 'student')
        // but we set it here for any Supabase-internal uses.
        role,
      },
    });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        name: fullName,
        phone: phone ?? "",
        role,               // Always 'student'
        pending_wallet: 0,
        wallet_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (profileError) console.error("Profile upsert error:", profileError.message);
    }

    res.status(201).json({ success: true, message: "Account created successfully. You can now sign in." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/auth/change-password", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (userRole !== "superadmin") {
      res.status(403).json({ error: "Only superadmins can change their password via this endpoint." });
      return;
    }

    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || newPassword.trim().length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters." });
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
