import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        page: "var(--bg-page)",
        surface: "var(--bg-surface)",
        "surface-alt": "var(--bg-surface-alt)",
        border: "var(--border)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        kicker: "var(--text-kicker)",
        win: "var(--color-win)",
        "win-bg": "var(--color-win-bg)",
        "win-border": "var(--color-win-border)",
        loss: "var(--color-loss)",
        "loss-bg": "var(--color-loss-bg)",
        "loss-border": "var(--color-loss-border)",
        brand: "var(--color-brand)",
        "brand-hover": "var(--color-brand-hover)",
        danger: "var(--color-danger)",
        inverse: "var(--text-inverse)"
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
