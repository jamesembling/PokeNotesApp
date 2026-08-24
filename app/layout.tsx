import type { Metadata } from "next";
import { SiteFormatsProvider } from "@/components/ui/SiteFormatsProvider";
import { getInitialSiteFormats } from "@/lib/formats/catalog";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { Toaster } from "@/components/shadcn/sonner";
import { TooltipProvider } from "@/components/shadcn/tooltip";
import "./globals.css";

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

const THEME_BOOTSTRAP_SCRIPT = `(()=>{try{const stored=localStorage.getItem("theme");const theme=stored==="dark"||stored!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.toggle("dark",theme==="dark");document.documentElement.style.colorScheme=theme}catch{}})()`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialSiteFormats = getInitialSiteFormats();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
          id="theme-bootstrap"
        />
      </head>
      <body>
        <SiteFormatsProvider initialSiteFormats={initialSiteFormats}>
          <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </ThemeProvider>
        </SiteFormatsProvider>
      </body>
    </html>
  );
}
