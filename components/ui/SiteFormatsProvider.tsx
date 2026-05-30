"use client";

import { createContext, use } from "react";
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
  return (
    <SiteFormatsContext.Provider value={initialSiteFormats}>
      {children}
    </SiteFormatsContext.Provider>
  );
}

export function useSiteFormats() {
  const context = use(SiteFormatsContext);

  if (!context) {
    throw new Error("useSiteFormats must be used within a SiteFormatsProvider");
  }

  return context;
}
