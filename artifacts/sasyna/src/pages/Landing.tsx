import { Link } from "wouter";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import {
  ArrowRight, BookOpen, Clock, RefreshCw, ShieldCheck,
  FileText, CheckCircle2, GraduationCap, Zap,
  Download, ChevronRight, Sparkles
} from "lucide-react";
import { ThemeCustomizer } from "@/components/layout/ThemeCustomizer";

const LOGO = "https://iili.io/q16t9bR.png";
const IMG_1 = "https://iili.io/qhmiMgt.jpg";
const IMG_2 = "https://iili.io/qhpdM5x.jpg";
const IMG_3 = "https://iili.io/qhpqsB2.jpg";
const IMG_4 = "https://iili.io/qhpAgFj.jpg";

const TYPING_FEATURES = [
  "Start a proposal with your research topic",
  "Your draft saves to your Sasyna account",
  "Review sections and download a Word document",
  "Continue your proposal whenever you return",
  "Research proposal access is free for now",
  "References link to real scholarly records",
  "Add study details whenever you have them",
];

function TypingText() {
  const [displayed, setDisplayed] = useState("");
  const [featureIndex, setFeatureIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const current = TYPING_FEATURES[featureIndex];
    if (isPaused) {
      timeoutRef.current = setTimeout(() => { setIsPaused(false); setIsDeleting(true); }, 2200);
      return;
    }
    if (isDeleting) {
      if (displayed.length === 0) { setIsDeleting(false); setFeatureIndex((i) => (i + 1) % TYPING_FEATURES.length); return; }
      timeoutRef.current = setTimeout(() => setDisplayed((d) => d.slice(0, -1)), 28);
    } else {
      if (displayed.length === current.length) { setIsPaused(true); return; }
      timeoutRef.current = setTimeout(() => setDisplayed(current.slice(0, displayed.length + 1)), 55);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [displayed, isDeleting, featureIndex, isPaused]);

  return (
    <div className="h-8 flex items-center justify-center">
      <span className="text-base sm:text-lg font-semibold text-primary">
        {displayed}
        <span className="inline-block w-0.5 h-5 bg-primary ml-0.5 align-middle animate-pulse" />
      </span>
    </div>
  );
}

function FloatingParticles() {
  const particles = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 5,
    duration: Math.random() * 8 + 6,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/20"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{ y: [0, -30, 0], opacity: [0.2, 0.8, 0.2], scale: [1, 1.5, 1] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function MorphingOrb({ className }: { className: string }) {
  return (
    <motion.div
      className={className}
      animate={{
        borderRadius: ["50%", "40% 60% 70% 30% / 40% 50% 60% 50%", "50% 50% 30% 70% / 50% 60% 40% 50%", "50%"],
        scale: [1, 1.05, 0.95, 1],
      }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.65, delay, ease: "easeOut" as const },
});

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

function CounterNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) { setStarted(true); }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let current = 0;
    const step = target / 60;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(current));
    }, 20);
    return () => clearInterval(timer);
  }, [started, target]);

  return <div ref={ref}>{count}{suffix}</div>;
}

export default function Landing() {
  const { scrollY } = useScroll();
  const heroParallax = useTransform(scrollY, [0, 500], [0, -80]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/25">
      {/* ─── NAV ─── */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-[68px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={LOGO} alt="Sasyna" draggable={false} className="w-9 h-9 rounded-xl object-contain pointer-events-none select-none" />
            <div>
              <span className="text-xl font-extrabold tracking-tight text-foreground">Sasyna</span>
              <span className="hidden sm:block text-[10px] font-medium text-muted-foreground leading-none -mt-0.5">The World of Research</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 sm:px-3 rounded-lg hover:bg-muted whitespace-nowrap">
              Sign In
            </Link>
            <Link href="/register" className="flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-semibold shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 hover:-translate-y-0.5 transition-all whitespace-nowrap">
              Get Started <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center lg:justify-start pt-[80px] lg:pt-[88px] pb-20 overflow-hidden">
        <FloatingParticles />
        <div className="absolute inset-0 pointer-events-none">
          <MorphingOrb className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-radial from-primary/20 via-violet-500/10 to-transparent blur-3xl opacity-70" />
          <MorphingOrb className="absolute top-0 right-0 w-80 h-80 bg-violet-500/15 blur-3xl" />
          <MorphingOrb className="absolute bottom-10 left-10 w-72 h-72 bg-indigo-500/10 blur-3xl" />
          <div className="absolute top-1/3 right-1/4 w-32 h-32 bg-pink-500/8 rounded-full blur-2xl" />
        </div>
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
          style={{
            backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 w-full">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-12 lg:gap-16">
            <div className="flex-1 text-center lg:text-left">
              <motion.div {...fadeIn(0.1)} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider mb-10">
                <Zap className="w-3 h-3" /> Research workspace · Free access
              </motion.div>

              <motion.div {...fadeUp(0.15)}>
                <img src={LOGO} alt="Sasyna" draggable={false} className="w-16 h-16 lg:hidden mx-auto mb-6 rounded-2xl shadow-2xl shadow-primary/30 object-contain pointer-events-none select-none" />
              </motion.div>

              <motion.h1 {...fadeUp(0.2)} className="text-5xl sm:text-6xl lg:text-7xl xl:text-[80px] font-black tracking-tight leading-[1.05] mb-6">
                The World of{" "}
                <span className="relative inline-block">
                  <span className="relative z-10 bg-gradient-to-r from-primary via-violet-500 to-indigo-500 bg-clip-text text-transparent">
                    Research
                  </span>
                  <motion.span
                    className="absolute inset-x-0 bottom-1 h-3 bg-gradient-to-r from-primary/30 via-violet-500/30 to-indigo-500/30 blur-md -z-0 rounded"
                    animate={{ scaleX: [1, 1.05, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  />
                </span>
              </motion.h1>

              <motion.p {...fadeUp(0.3)} className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl lg:max-w-none mb-6">
                Start with a working title. Sasyna prepares a research-proposal draft, saves progress to your account, and lets you review and export your work when it is ready.
              </motion.p>

              <motion.div {...fadeIn(0.35)} className="mb-8 px-6 py-3 rounded-2xl bg-primary/8 border border-primary/15 max-w-xl lg:max-w-none mx-auto lg:mx-0">
                <TypingText />
              </motion.div>

              <motion.div {...fadeUp(0.4)} className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4">
                <Link href="/register" className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-primary text-primary-foreground text-base font-bold shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/50 hover:-translate-y-1 transition-all duration-300">
                  Start Your Research <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="/login" className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-muted text-foreground text-base font-semibold hover:bg-muted/80 transition-all border border-border">
                  Sign In to Dashboard
                </Link>
              </motion.div>

              <motion.div {...fadeUp(0.55)} className="mt-10 grid grid-cols-3 gap-4 sm:gap-6 max-w-sm lg:max-w-none mx-auto">
                {[
                  { val: "48h", label: "Delivery" },
                  { val: "100%", label: "Original" },
                  { val: "Free", label: "Revisions" },
                ].map(({ val, label }) => (
                  <div key={label} className="rounded-2xl bg-card border border-border/60 px-4 py-3 text-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <div className="text-2xl font-black text-primary">{val}</div>
                    <div className="text-xs font-medium text-muted-foreground mt-0.5">{label}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Hero Image Card */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ y: heroParallax }}
              className="hidden lg:block relative flex-shrink-0 w-[320px] lg:mt-6"
            >
              <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-primary/20 border border-border/50">
                <img src={IMG_1} alt="Research" draggable={false} className="w-full h-[400px] object-cover pointer-events-none select-none" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="bg-white/15 backdrop-blur-xl border border-white/25 rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-white text-xs font-bold">Proposal draft ready</div>
                        <div className="text-white/70 text-xs">Research project · Saved to your account</div>
                      </div>
                    </div>
                    <div className="text-white/90 text-xs font-mono">Sasyna Research Studio</div>
                  </div>
                </div>
              </div>

              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-6 -right-6 bg-primary text-primary-foreground rounded-2xl p-4 shadow-xl shadow-primary/40"
              >
                <Sparkles className="w-6 h-6 mb-1" />
                <div className="text-xs font-bold">Saved</div>
                <div className="text-xs opacity-80">Progress</div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -bottom-4 -left-6 bg-card border border-border rounded-2xl p-3 shadow-xl"
              >
                <div className="text-xs font-bold text-foreground">✓ Free access</div>
                <div className="text-xs text-muted-foreground">No checkout for now</div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── STATS BAND ─── */}
      <section className="py-14 bg-gradient-to-r from-primary via-violet-600 to-indigo-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-64 h-full bg-white/20 skew-x-12 -translate-x-20" />
          <div className="absolute top-0 right-0 w-48 h-full bg-white/10 skew-x-12 translate-x-20" />
        </div>
        <div className="max-w-5xl mx-auto px-5 sm:px-8 relative z-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center text-white">
            {[
              { target: 1, suffix: "", label: "Starting point", display: "1 topic" },
              { target: 0, suffix: "", label: "Project drafts", display: "Saved" },
              { target: 0, suffix: "", label: "Access", display: "Free for now" },
              { target: 0, suffix: "", label: "Proposal export", display: "Word" },
            ].map(({ target, suffix, label, display }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="text-3xl sm:text-4xl font-black mb-1">
                  {display ?? <CounterNumber target={target} suffix={suffix} />}
                </div>
                <div className="text-white/70 text-sm font-medium">{label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-24 sm:py-32 relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)" }}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-5 sm:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1">
              <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-12">
                <p className="text-primary font-semibold uppercase tracking-widest text-xs mb-3">Simple Process</p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
                  How Sasyna Works
                </h2>
                <p className="mt-4 text-muted-foreground text-lg">
                  From a research topic to a draft you can review and continue.
                </p>
              </motion.div>

              <div className="space-y-5">
                {[
                  { icon: GraduationCap, step: "01", title: "Create an account", desc: "Sign in to keep your research projects and drafts together.", color: "text-emerald-600", bg: "bg-emerald-500/10" },
                  { icon: FileText, step: "02", title: "Add your topic", desc: "A working title is enough to start. Add other study details whenever you have them.", color: "text-violet-500", bg: "bg-violet-500/10" },
                  { icon: BookOpen, step: "03", title: "Sasyna drafts your proposal", desc: "Proposal sections and progress are saved to your account as the work continues.", color: "text-emerald-500", bg: "bg-emerald-500/10" },
                  { icon: Download, step: "04", title: "Review and export", desc: "Check the draft, confirm study-specific details with your supervisor, and download a Word document.", color: "text-amber-500", bg: "bg-amber-500/10" },
                ].map(({ icon: Icon, step, title, desc, color, bg }, i) => (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: -24 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.55 }}
                    className="flex items-start gap-5 group"
                  >
                    <div className="relative flex-shrink-0">
                      <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                        <Icon className={`w-6 h-6 ${color}`} />
                      </div>
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-[9px] font-black flex items-center justify-center">{i + 1}</span>
                    </div>
                    <div className="pt-1">
                      <h3 className="text-base font-bold text-foreground mb-1">{title}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="hidden lg:block flex-shrink-0 w-[360px]"
            >
              <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                <img src={IMG_2} alt="Academic study" draggable={false} className="w-full h-[420px] object-cover pointer-events-none select-none" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute top-6 left-6 bg-white/15 backdrop-blur-xl border border-white/25 rounded-2xl px-4 py-2.5">
                  <div className="text-white text-sm font-bold">Sasyna Research Studio</div>
                  <div className="text-white/70 text-xs">Your proposal, saved as you work</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── SERVICES ─── */}
      <section className="py-24 sm:py-32 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-radial from-primary/8 to-transparent blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 relative z-10">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <p className="text-primary font-semibold uppercase tracking-widest text-xs mb-3">Research Studio</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
              From Topic to Proposal Draft
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: BookOpen,
                title: "Start with your topic",
                desc: "Create a proposal project from a working title. Add study details when you have them, or begin drafting with the information already available.",
                tags: ["Topic-first", "Autosaved", "Add details later"],
                color: "from-blue-500/10 to-indigo-500/10",
                border: "border-blue-500/20",
                iconColor: "text-blue-500",
                iconBg: "bg-blue-500/10",
              },
              {
                icon: FileText,
                title: "Review and continue",
                desc: "Sasyna saves proposal sections and progress to your account. Return later to review, edit, and export your Word document.",
                tags: ["Saved sections", "Editable draft", "Word export"],
                color: "from-violet-500/10 to-purple-500/10",
                border: "border-violet-500/20",
                iconColor: "text-violet-500",
                iconBg: "bg-violet-500/10",
              },
            ].map(({ icon: Icon, title, desc, tags, color, border, iconColor, iconBg }) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className={`relative group bg-gradient-to-br ${color} border ${border} rounded-3xl p-8 sm:p-10 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300`}
              >
                <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-7 h-7 ${iconColor}`} />
                </div>
                <h3 className="text-2xl font-black text-foreground mb-3">{title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-6">{desc}</p>
                <div className="flex flex-wrap gap-2">
                  {tags.map(t => (
                    <span key={t} className="px-3 py-1 rounded-full bg-background/60 border border-border text-xs font-medium text-foreground">{t}</span>
                  ))}
                </div>
                <Link href="/register" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all">
                  Start a Proposal <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SHOWCASE IMAGE ─── */}
      <section className="py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-12 gap-4 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="col-span-12 md:col-span-5 rounded-3xl overflow-hidden shadow-2xl">
              <img src={IMG_3} alt="University campus" draggable={false} className="w-full h-64 md:h-80 object-cover pointer-events-none select-none" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }} className="col-span-12 md:col-span-7 flex flex-col justify-center px-0 md:px-8">
              <p className="text-primary font-semibold uppercase tracking-widest text-xs mb-3">Sasyna Research Studio</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-4">
                A Draft You Can Review
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Sasyna drafts proposal sections from the details you provide and links supported citations to scholarly catalog records. Review the sources, confirm study-specific details, and follow your supervisor’s requirements before submission.
              </p>
              <div className="flex flex-wrap gap-3">
                {["Source-linked citations", "Saved progress", "Editable sections", "Supervisor review"].map(t => (
                  <span key={t} className="flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted px-3 py-1.5 rounded-xl border border-border">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {t}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── WHY SASYNA (dark section) ─── */}
      <section className="py-24 sm:py-32 relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 relative z-10">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <p className="text-violet-400 font-semibold uppercase tracking-widest text-xs mb-3">Why Choose Us</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
              Built for the Modern Student
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Clock, title: "Saved progress", desc: "Your project details, completed sections, and writing progress stay in your Sasyna account.", color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/20" },
              { icon: RefreshCw, title: "Continue later", desc: "Leave the app and return to the same proposal. Draft generation continues in the background.", color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/20" },
              { icon: ShieldCheck, title: "Traceable references", desc: "Citations are linked to scholarly catalog records. Review every source and claim before submission.", color: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/20" },
              { icon: Sparkles, title: "Free for now", desc: "Research-proposal drafting is available without a deposit or checkout while Sasyna prepares the workspace.", color: "text-violet-400", bg: "bg-violet-500/15", border: "border-violet-500/20" },
              { icon: FileText, title: "Review each section", desc: "Edit the proposal draft and fill in institution-specific details before you share it.", color: "text-pink-400", bg: "bg-pink-500/15", border: "border-pink-500/20" },
              { icon: Download, title: "Word export", desc: "Download the proposal as a Word document for review and further editing.", color: "text-indigo-400", bg: "bg-indigo-500/15", border: "border-indigo-500/20" },
            ].map(({ icon: Icon, title, desc, color, bg, border }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`${bg} border ${border} rounded-3xl p-7 hover:scale-[1.02] transition-all duration-300 group backdrop-blur-sm`}
              >
                <div className={`w-12 h-12 rounded-2xl ${bg} border ${border} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${color}`} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-16 text-center"
          >
            <Link href="/register" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-slate-900 font-bold shadow-xl hover:-translate-y-1 transition-all duration-300 text-base">
              Join Sasyna Today <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── PHOTO SHOWCASE ─── */}
      <section className="py-20 sm:py-28 overflow-hidden bg-muted/20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <p className="text-primary font-semibold uppercase tracking-widest text-xs mb-3">Your Research Workspace</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              Keep Your Proposal Together
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Keep your project details, proposal sections, and linked references in your Sasyna account.
            </p>
          </motion.div>

          <div className="grid grid-cols-12 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0 }} className="col-span-12 sm:col-span-8 md:col-span-7 rounded-3xl overflow-hidden shadow-xl h-64 sm:h-80">
              <img src={IMG_4} alt="Student working" draggable={false} className="w-full h-full object-cover pointer-events-none select-none hover:scale-105 transition-transform duration-700" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="col-span-12 sm:col-span-4 md:col-span-5 rounded-3xl overflow-hidden shadow-xl h-64 sm:h-80">
              <img src={IMG_1} alt="Research team" draggable={false} className="w-full h-full object-cover object-top pointer-events-none select-none hover:scale-105 transition-transform duration-700" />
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-10 text-center">
            <Link href="/register" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/30 hover:-translate-y-0.5 transition-all">
              Get Started Now <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── ORDER STATUS FLOW (dark) ─── */}
      <section className="py-24 sm:py-32 overflow-hidden bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950 relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 relative z-10">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <p className="text-violet-400 font-semibold uppercase tracking-widest text-xs mb-3">Full Transparency</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
              Follow Your Proposal
            </h2>
            <p className="mt-4 text-white/60 text-lg max-w-xl mx-auto">Your saved project shows which proposal sections are ready and what is still being drafted.</p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-3">
            {[
              { label: "Topic saved", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
              { label: "Project details saved", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
              { label: "Sources checked", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
              { label: "Sections drafted", color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
              { label: "Ready to review", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
              { label: "Edits saved", color: "bg-green-500/20 text-green-300 border-green-500/30" },
              { label: "Word export", color: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
            ].map(({ label, color }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, scale: 0.85 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border font-medium text-sm ${color}`}
              >
                <CheckCircle2 className="w-4 h-4" /> {label}
                {i < 6 && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ─── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary via-violet-600 to-indigo-700 p-10 sm:p-16 text-center shadow-2xl shadow-primary/30"
          >
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-300/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
              {Array.from({ length: 12 }, (_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 bg-white/20 rounded-full"
                  style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
                  animate={{ scale: [0, 1.5, 0], opacity: [0, 0.8, 0] }}
                  transition={{ duration: 3, delay: i * 0.4, repeat: Infinity }}
                />
              ))}
            </div>
            <div className="relative z-10">
              <img src={LOGO} alt="Sasyna" draggable={false} className="w-16 h-16 mx-auto mb-6 rounded-2xl shadow-xl pointer-events-none select-none" />
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
                Ready to start your research?
              </h2>
              <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
                Start with your research topic and return to a proposal draft saved in your account.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register" className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-white text-primary font-bold text-base hover:bg-white/90 hover:-translate-y-0.5 transition-all shadow-xl">
                  Create Free Account <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="/login" className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-white/15 text-white font-semibold text-base border border-white/25 hover:bg-white/20 transition-all backdrop-blur">
                  Sign In
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-border py-10">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={LOGO} alt="Sasyna" draggable={false} className="w-8 h-8 rounded-lg object-contain pointer-events-none select-none" />
            <div>
              <span className="font-bold text-foreground">Sasyna</span>
              <span className="text-muted-foreground text-xs ml-2">· The World of Research</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} Sasyna. All rights reserved. · Research proposal workspace · Free access for now
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Register</Link>
          </div>
        </div>
      </footer>

      <ThemeCustomizer />
    </div>
  );
}
