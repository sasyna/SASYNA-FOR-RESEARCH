import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
type Font = "Inter" | "Poppins" | "Roboto" | "Merriweather";

interface ThemeContextType {
  theme: Theme;
  font: Font;
  primaryColor: string;
  setTheme: (theme: Theme) => void;
  setFont: (font: Font) => void;
  setPrimaryColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const FONTS: Record<Font, string> = {
  Inter: "'Inter', sans-serif",
  Poppins: "'Poppins', sans-serif",
  Roboto: "'Roboto', sans-serif",
  Merriweather: "'Merriweather', serif",
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [font, setFont] = useState<Font>("Inter");
  const [primaryColor, setPrimaryColor] = useState<string>("142 71% 45%");

  useEffect(() => {
    const savedTheme = localStorage.getItem("sasyna-theme") as Theme | null;
    const savedFont = localStorage.getItem("sasyna-font") as Font | null;
    const savedColor = localStorage.getItem("sasyna-color");

    if (savedTheme) setTheme(savedTheme);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
    
    if (savedFont) setFont(savedFont);
    if (savedColor) setPrimaryColor(savedColor);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("sasyna-theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.style.setProperty("--app-font-sans", FONTS[font]);
    localStorage.setItem("sasyna-font", font);
  }, [font]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.style.setProperty("--primary", primaryColor);
    localStorage.setItem("sasyna-color", primaryColor);
  }, [primaryColor]);

  return (
    <ThemeContext.Provider value={{ theme, font, primaryColor, setTheme, setFont, setPrimaryColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
