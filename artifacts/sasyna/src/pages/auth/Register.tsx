import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail, Lock, User as UserIcon, Phone, Eye, EyeOff, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ThemeCustomizer } from "@/components/layout/ThemeCustomizer";

const LOGO = "https://iili.io/q16t9bR.png";

const registerSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(7, "Please enter a valid phone number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function mapRegisterError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already exists") || m.includes("duplicate")) {
    return "An account with this email already exists. Please sign in instead.";
  }
  if (m.includes("password should be at least") || m.includes("password is too short")) {
    return "Your password is too short. Please use at least 6 characters.";
  }
  if (m.includes("invalid email") || m.includes("email format")) {
    return "Please enter a valid email address.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Too many registration attempts. Please wait a moment and try again.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Connection error. Please check your internet and try again.";
  }
  return message;
}

type RegisterForm = z.infer<typeof registerSchema>;

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.4, delay },
});

export default function Register() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          fullName: data.fullName,
          phone: data.phone,
          role: "student",
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(mapRegisterError(result.error || "Registration failed. Please try again."));
        setIsLoading(false);
        return;
      }

      const { error: signInError, data: authData } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError) {
        setError(mapRegisterError(signInError.message));
        setIsLoading(false);
        return;
      }

      const role = authData.user?.user_metadata?.role || "student";
      if (role === "admin") setLocation("/admin/dashboard");
      else if (role === "superadmin") setLocation("/superadmin/dashboard");
      else setLocation("/student/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    }

    setIsLoading(false);
  };

  const inputCls = (hasError: boolean) =>
    cn(
      "w-full pl-12 pr-4 py-3.5 rounded-xl bg-muted/50 border-2 border-border focus:border-primary focus:bg-background outline-none transition-all text-foreground placeholder:text-muted-foreground",
      hasError && "border-destructive focus:border-destructive bg-destructive/5"
    );

  return (
    <div className="min-h-screen flex bg-background">
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 lg:px-20 py-12 z-10">
        <motion.div {...fadeIn(0)}>
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit mb-8 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
        </motion.div>

        <div className="max-w-md w-full mx-auto">
          <motion.div {...fadeUp(0.05)} className="flex items-center gap-3 mb-8">
            <img src={LOGO} alt="Sasyna" draggable={false} className="w-10 h-10 rounded-xl object-contain pointer-events-none" />
            <span className="text-xl font-bold text-foreground">Sasyna</span>
          </motion.div>

          <motion.div {...fadeUp(0.1)} className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Create your account</h1>
            <p className="text-muted-foreground">Create an account to start and save your research proposals</p>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="mb-5 flex items-start gap-3 p-4 rounded-2xl bg-destructive/10 text-destructive border border-destructive/25 text-sm font-medium"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <motion.div {...fadeUp(0.15)}>
              <label className="text-sm font-medium text-foreground block mb-1.5">Full Name</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input {...register("fullName")} autoComplete="name" className={inputCls(!!errors.fullName)} placeholder="Jane Doe" />
              </div>
              {errors.fullName && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-destructive text-xs mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.fullName.message}
                </motion.p>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.18)}>
              <label className="text-sm font-medium text-foreground block mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input {...register("email")} type="email" autoComplete="email" className={inputCls(!!errors.email)} placeholder="you@example.com" />
              </div>
              {errors.email && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-destructive text-xs mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.email.message}
                </motion.p>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.21)}>
              <label className="text-sm font-medium text-foreground block mb-1.5">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input {...register("phone")} type="tel" autoComplete="tel" className={inputCls(!!errors.phone)} placeholder="+254 700 000 000" />
              </div>
              {errors.phone && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-destructive text-xs mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.phone.message}
                </motion.p>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.24)}>
              <label className="text-sm font-medium text-foreground block mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className={cn(inputCls(!!errors.password), "pr-12")}
                  placeholder="At least 6 characters"
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
                  className="text-destructive text-xs mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.password.message}
                </motion.p>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.27)}>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-primary to-violet-600 text-white font-bold text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Account"}
              </button>
            </motion.div>
          </form>

          <motion.p {...fadeUp(0.3)} className="mt-6 text-center text-muted-foreground text-sm">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
          </motion.p>
        </div>
      </div>

      <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center bg-gradient-to-br from-indigo-950 via-violet-900 to-slate-900">
        <img
          src="https://iili.io/qhpdM5x.jpg"
          alt="Academic research"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none select-none"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/85 via-violet-900/75 to-slate-900/85" />
        <div className="relative z-10 max-w-md p-12 text-center">
          <img src={LOGO} alt="Sasyna Logo" draggable={false} className="w-24 h-24 mx-auto mb-8 drop-shadow-2xl pointer-events-none" />
          <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
            Start your research <span className="text-emerald-300">workspace</span>
          </h2>
          <p className="text-white/70 text-lg leading-relaxed mb-8">
            Keep your project details and proposal drafts in one account. Begin with a topic and add more details later.
          </p>
          <div className="grid grid-cols-2 gap-4 text-left">
            {[
              { label: "Saved", sub: "Project progress" },
              { label: "Free", sub: "Access for now" },
              { label: "Editable", sub: "Proposal drafts" },
              { label: "One topic", sub: "To get started" },
            ].map(({ label, sub }) => (
              <div key={label} className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                <div className="text-2xl font-bold text-white">{label}</div>
                <div className="text-white/60 text-sm">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ThemeCustomizer />
    </div>
  );
}
