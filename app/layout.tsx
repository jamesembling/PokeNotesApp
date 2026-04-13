import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteFormatsProvider } from "@/components/ui/SiteFormatsProvider";
import { getInitialSiteFormats } from "@/lib/formats/catalog";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import "./globals.css";

type Theme = "light" | "dark";

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

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialTheme = parseTheme(cookieStore.get(THEME_COOKIE_KEY)?.value);
  const initialSiteFormats = getInitialSiteFormats();

  return (
    <html
      className={initialTheme === "dark" ? "dark" : ""}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: buildThemeBootScript(initialTheme) }} />
      </head>
      <body>
        <SiteFormatsProvider initialSiteFormats={initialSiteFormats}>
          <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
        </SiteFormatsProvider>
      </body>
    </html>
  );
}
