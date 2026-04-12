"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { SiteFormatsCatalog } from "@/lib/formats/catalog";

type SiteFormatsContextValue = SiteFormatsCatalog;

const SiteFormatsContext = createContext<SiteFormatsContextValue | null>(null);

export function SiteFormatsProvider({
  children,
  initialSiteFormats
}: {
  children: React.ReactNode;
  initialSiteFormats: SiteFormatsCatalog;
}) {
  const [siteFormats, setSiteFormats] = useState<SiteFormatsCatalog>(initialSiteFormats);

  useEffect(() => {
    let cancelled = false;

    async function refreshSiteFormats() {
      try {
        const response = await fetch("/api/site-formats", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const nextSiteFormats = (await response.json()) as SiteFormatsCatalog;
        if (cancelled) {
          return;
        }

        setSiteFormats(nextSiteFormats);
      } catch {}
    }

    void refreshSiteFormats();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => siteFormats, [siteFormats]);

  return <SiteFormatsContext.Provider value={value}>{children}</SiteFormatsContext.Provider>;
}

export function useSiteFormats() {
  const context = useContext(SiteFormatsContext);

  if (!context) {
    throw new Error("useSiteFormats must be used within a SiteFormatsProvider");
  }

  return context;
}
