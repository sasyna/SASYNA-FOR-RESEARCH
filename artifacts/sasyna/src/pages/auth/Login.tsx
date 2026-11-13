import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail, Lock, CheckCircle, Eye, EyeOff, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ThemeCustomizer } from "@/components/layout/ThemeCustomizer";

const LOGO = "https://iili.io/q16t9bR.png";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return "Incorrect email or password. Please double-check and try again.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Your email hasn't been verified. Please check your inbox.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Too many login attempts. Please wait a few minutes and try again.";
  }
  if (m.includes("user not found") || m.includes("no user")) {
    return "No account found with this email address. Please register first.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Connection error. Please check your internet and try again.";
  }
  return message;
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.4, delay },
});

export default function Login() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    setIsLoading(true);
    setError(null);

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setIsLoading(false);
      setError(mapAuthError(error.message));
      return;
    }

    // Always read the role from the backend (profiles table) — never trust user_metadata
    try {
      const token = authData.session?.access_token;
      const meRes = await fetch("/api/auth/me", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const me = meRes.ok ? await meRes.json() : null;
      const role = me?.role ?? authData.user?.user_metadata?.role;

      if (role === "admin") setLocation("/admin/dashboard");
      else if (role === "superadmin") setLocation("/superadmin/dashboard");
      else setLocation("/student/dashboard");
    } catch {
      // Fallback to metadata if network error
      const role = authData.user?.user_metadata?.role;
      if (role === "admin") setLocation("/admin/dashboard");
      else if (role === "superadmin") setLocation("/superadmin/dashboard");
      else setLocation("/student/dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 lg:px-24 py-12 z-10">
        <motion.div {...fadeIn(0)}>
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit mb-12 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
        </motion.div>

        <div className="max-w-md w-full mx-auto">
          <motion.div {...fadeUp(0.05)} className="flex items-center gap-3 mb-8">
            <img src={LOGO} alt="Sasyna" draggable={false} className="w-10 h-10 rounded-xl object-contain pointer-events-none" />
            <span className="text-xl font-bold text-foreground">Sasyna</span>
          </motion.div>

          <motion.div {...fadeUp(0.1)} className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Welcome back</h1>
            <p className="text-muted-foreground">Sign in to your Sasyna account</p>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-destructive/10 text-destructive border border-destructive/25 text-sm font-medium"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <motion.div {...fadeUp(0.15)} className="space-y-2">
              <label className="text-sm font-medium text-foreground ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
                  {...register("email")}
                  type="email"
                  autoComplete="email"
                  className={cn(
                    "w-full pl-12 pr-4 py-3.5 rounded-xl bg-muted/50 border-2 border-border focus:border-primary focus:bg-background outline-none transition-all text-foreground placeholder:text-muted-foreground",
                    errors.email && "border-destructive focus:border-destructive bg-destructive/5"
                  )}
                  placeholder="name@example.com"
                />
              </div>
              {errors.email && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-destructive text-xs ml-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.email.message}
                </motion.p>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.2)} className="space-y-2">
              <label className="text-sm font-medium text-foreground ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={cn(
                    "w-full pl-12 pr-12 py-3.5 rounded-xl bg-muted/50 border-2 border-border focus:border-primary focus:bg-background outline-none transition-all text-foreground placeholder:text-muted-foreground",
                    errors.password && "border-destructive focus:border-destructive bg-destructive/5"
                  )}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-destructive text-xs ml-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.password.message}
                </motion.p>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.25)}>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-violet-600 text-white font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
              </button>
            </motion.div>
          </form>

          <motion.p {...fadeUp(0.3)} className="mt-8 text-center text-muted-foreground text-sm">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary font-semibold hover:underline">Register here</Link>
          </motion.p>
        </div>
      </div>

      <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center bg-gradient-to-br from-indigo-950 via-violet-900 to-slate-900">
        <img
          src="https://iili.io/qhmiMgt.jpg"
          alt="Research"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none select-none"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/80 via-violet-900/70 to-slate-900/80" />
        <div className="relative z-10 max-w-md p-12 text-center">
          <img src={LOGO} alt="Sasyna Logo" draggable={false} className="w-24 h-24 mx-auto mb-8 drop-shadow-2xl pointer-events-none" />
          <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
            Your research, <span className="text-emerald-300">saved</span> as you work
          </h2>
          <p className="text-white/70 text-lg leading-relaxed mb-8">
            Start with a topic, build a proposal draft, and return to your saved work whenever you need.
          </p>
          <div className="space-y-3 text-left">
            {["Start with a research topic", "Draft progress saved to your account", "Review and edit proposal sections", "Free access while the workspace launches"].map(t => (
              <div key={t} className="flex items-center gap-3 text-white/80 text-sm">
                <CheckCircle className="w-4 h-4 text-violet-400 shrink-0" /> {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ThemeCustomizer />
    </div>
  );
}
