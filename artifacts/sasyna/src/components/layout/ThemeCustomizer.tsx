import { useState } from "react";
import { Moon, Sun, Check, ChevronDown, ChevronUp, Palette } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const COLORS = [
  { name: "Green", value: "142 71% 45%", class: "bg-emerald-500" },
  { name: "Indigo", value: "230 100% 60%", class: "bg-indigo-500" },
  { name: "Violet", value: "262 83% 58%", class: "bg-violet-500" },
  { name: "Rose", value: "346 87% 60%", class: "bg-rose-500" },
  { name: "Amber", value: "38 92% 50%", class: "bg-amber-500" },
];

const FONTS = ["Inter", "Poppins", "Roboto", "Merriweather"] as const;

export function ThemePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme, font, setFont, primaryColor, setPrimaryColor } = useTheme();

  return (
    <div className="border-t border-sidebar-border mt-1">
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground rounded-xl transition-all duration-200 group"
      >
        <Palette className="w-5 h-5 shrink-0 text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70 transition-colors" />
        <span className="text-sm font-medium flex-1 text-left">Appearance</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-sidebar-foreground/40 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-sidebar-foreground/40 shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* Mode */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/30">Mode</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTheme("light")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-all",
                      theme === "light"
                        ? "border-primary/60 bg-primary/15 text-white"
                        : "border-white/10 text-sidebar-foreground/50 hover:border-white/20 hover:text-sidebar-foreground/70"
                    )}
                  >
                    <Sun className="w-3.5 h-3.5" /> Light
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-all",
                      theme === "dark"
                        ? "border-primary/60 bg-primary/15 text-white"
                        : "border-white/10 text-sidebar-foreground/50 hover:border-white/20 hover:text-sidebar-foreground/70"
                    )}
                  >
                    <Moon className="w-3.5 h-3.5" /> Dark
                  </button>
                </div>
              </div>

              {/* Accent Color */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/30">Accent</p>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setPrimaryColor(c.value)}
                      title={c.name}
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 shrink-0",
                        c.class,
                        primaryColor === c.value ? "ring-2 ring-offset-1 ring-offset-sidebar ring-white/70 scale-110" : ""
                      )}
                    >
                      {primaryColor === c.value && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/30">Font</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {FONTS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFont(f)}
                      style={{ fontFamily: f === "Merriweather" ? "'Merriweather', serif" : `'${f}', sans-serif` }}
                      className={cn(
                        "p-1.5 rounded-lg border text-xs text-left transition-all",
                        font === f
                          ? "border-primary/60 bg-primary/15 text-white"
                          : "border-white/10 text-sidebar-foreground/50 hover:border-white/20 hover:text-sidebar-foreground/70"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ThemeCustomizer() {
  return null;
}
