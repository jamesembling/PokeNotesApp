import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import "./globals.css";

type Theme = "light" | "dark";

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Poke Notes",
  description: "Competitive Pokemon TCG notes, logs, and analysis."
};

const THEME_COOKIE_KEY = "theme";

function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}

function buildThemeBootScript(initialTheme: Theme) {
  return `
    (() => {
      const storageKey = "theme";
      const cookieKey = "${THEME_COOKIE_KEY}";
      const initialTheme = "${initialTheme}";

      let nextTheme = initialTheme;

      try {
        const storedTheme = window.localStorage.getItem(storageKey);
        if (storedTheme === "dark" || storedTheme === "light") {
          nextTheme = storedTheme;
        } else {
          const cookieTheme = document.cookie
            .split("; ")
            .find((entry) => entry.startsWith(cookieKey + "="))
            ?.split("=")[1];

          if (cookieTheme === "dark" || cookieTheme === "light") {
            nextTheme = cookieTheme;
          }
        }
      } catch {}

      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      document.documentElement.style.colorScheme = nextTheme;

      try {
        window.localStorage.setItem(storageKey, nextTheme);
        document.cookie = cookieKey + "=" + nextTheme + "; path=/; max-age=31536000; samesite=lax";
      } catch {}
    })();
  `;
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialTheme = parseTheme(cookies().get(THEME_COOKIE_KEY)?.value);

  return (
    <html
      className={`${bodyFont.variable} ${initialTheme === "dark" ? "dark" : ""}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: buildThemeBootScript(initialTheme) }} />
      </head>
      <body>
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
