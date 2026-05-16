import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

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
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)"
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)"
        },
        kicker: "var(--text-kicker)",
        win: "var(--color-win)",
        "win-strong": "var(--color-win-strong)",
        "win-bg": "var(--color-win-bg)",
        "win-border": "var(--color-win-border)",
        loss: "var(--color-loss)",
        "loss-strong": "var(--color-loss-strong)",
        "loss-bg": "var(--color-loss-bg)",
        "loss-border": "var(--color-loss-border)",
        warning: "var(--color-warning)",
        "warning-strong": "var(--color-warning-strong)",
        "warning-bg": "var(--color-warning-bg)",
        "warning-border": "var(--color-warning-border)",
        brand: "var(--color-brand)",
        "brand-hover": "var(--color-brand-hover)",
        danger: "var(--color-danger)",
        inverse: "var(--text-inverse)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)"
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)"
        },
        destructive: "var(--destructive)",
        input: "var(--input)",
        ring: "var(--ring)",
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)"
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)"
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-body)", "system-ui", "-apple-system", "sans-serif"]
      }
    }
  },
  plugins: [animate]
};

export default config;
