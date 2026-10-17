"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = "theme";
const THEME_COOKIE_KEY = "theme";
const THEME_SWITCHING_CLASS = "theme-switching";
const THEME_TRANSITION_DURATION_MS = 180;

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function persistTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme changes remain usable when browser storage is denied.
  }
  document.cookie = `${THEME_COOKIE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

function animateThemeSwitch() {
  const root = document.documentElement;

  root.classList.add(THEME_SWITCHING_CLASS);
  window.setTimeout(() => {
    root.classList.remove(THEME_SWITCHING_CLASS);
  }, THEME_TRANSITION_DURATION_MS);
}

export function ThemeProvider({
  children,
  initialTheme = "light"
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    let storedTheme: string | null = null;
    try {
      storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Keep the system/server preference when browser storage is denied.
    }
    const nextTheme: Theme =
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : initialTheme;

    setTheme(nextTheme);
    applyTheme(nextTheme);
    persistTheme(nextTheme);
  }, [initialTheme]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme: Theme = currentTheme === "dark" ? "light" : "dark";

      animateThemeSwitch();
      persistTheme(nextTheme);
      applyTheme(nextTheme);

      return nextTheme;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme
    }),
    [theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = use(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
