import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseForAuth = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // SECURITY: Always wipe any client-supplied x-user-* headers FIRST.
  // Without this, an attacker could send x-user-role: superadmin with no token
  // and bypass all role checks in every route handler.
  delete req.headers["x-user-id"];
  delete req.headers["x-user-role"];
  delete req.headers["x-user-email"];
  delete req.headers["x-user-name"];

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const { data: { user }, error } = await supabaseForAuth.auth.getUser(token);

    if (error || !user) {
      // Invalid or expired token — leave headers empty (unauthenticated)
      next();
      return;
    }

    // SECURITY: Always read the role from the database, never from user metadata.
    // User metadata can be set by the client; the profiles table role can only be
    // changed by the service_role (backend/superadmin).
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    // If no profile row found, default to 'student' — never trust metadata
    const role = profile?.role ?? "student";

    req.headers["x-user-id"] = user.id;
    req.headers["x-user-role"] = role;
    req.headers["x-user-email"] = user.email ?? "";
    req.headers["x-user-name"] = profile?.full_name ?? "";

    next();
  } catch {
    // On any error, leave headers empty (treat as unauthenticated)
    next();
  }
}
