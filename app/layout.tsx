import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteFormatsProvider } from "@/components/ui/SiteFormatsProvider";
import { getInitialSiteFormats } from "@/lib/formats/catalog";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { Toaster } from "@/components/shadcn/sonner";
import { TooltipProvider } from "@/components/shadcn/tooltip";
import "./globals.css";

type Theme = "light" | "dark";

export const metadata: Metadata = {
  title: "Poke Notes",
  description: "Competitive Pokemon TCG notes, logs, and analysis.",
  icons: {
    icon: [
      { url: "/pokeball-icon.svg", type: "image/svg+xml" }
    ],
    shortcut: "/pokeball-icon.svg"
  }
};

function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialTheme = parseTheme(cookieStore.get("theme")?.value);
  const initialSiteFormats = getInitialSiteFormats();

  return (
    <html
      className={initialTheme === "dark" ? "dark" : ""}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <SiteFormatsProvider initialSiteFormats={initialSiteFormats}>
          <ThemeProvider initialTheme={initialTheme}>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </ThemeProvider>
        </SiteFormatsProvider>
      {/* impeccable-live-start */}
<script src="http://localhost:8400/live.js"></script>
{/* impeccable-live-end */}
</body>
    </html>
  );
}
