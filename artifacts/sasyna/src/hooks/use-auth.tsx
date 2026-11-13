import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setTokenProvider } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export type Role = "student" | "admin" | "superadmin";

interface ProfileData { role: Role | null; name: string | null; }

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: Role | null;
  name: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfileFromServer(accessToken: string): Promise<ProfileData> {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { role: null, name: null };
    const data = await res.json();
    return { role: (data.role as Role) || null, name: data.name || null };
  } catch {
    return { role: null, name: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    setTokenProvider(() => {
      const raw = Object.keys(localStorage).find(k => k.includes("auth-token"));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(localStorage.getItem(raw) || "{}");
        return parsed?.access_token || null;
      } catch { return null; }
    });

    const applySession = async (sess: Session | null, isInit = false) => {
      if (isInit) setIsLoading(true);

      setSession(sess);
      setUser(sess?.user ?? null);

      if (sess?.access_token) {
        // Optimistically set role from metadata while we fetch the real profile
        const metadataRole = sess.user?.user_metadata?.role as Role | null;
        if (metadataRole) setRole(metadataRole);

        // Always resolve name and role from the profiles table — never trust metadata
        const profile = await fetchProfileFromServer(sess.access_token);
        setRole(profile.role || metadataRole || null);
        setName(profile.name || sess.user?.user_metadata?.full_name || sess.user?.user_metadata?.name || null);
      } else {
        setRole(null);
        setName(null);
      }

      if (isInit) setIsLoading(false);
    };

    const init = async () => {
      const { data: { session: sess }, error } = await supabase.auth.getSession();
      if (error) console.error("Error getting session", error);
      await applySession(sess, true);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      applySession(sess, false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Clear all cached query data so the next user doesn't see previous user's data
    queryClient.clear();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, name, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
