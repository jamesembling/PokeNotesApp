import type { ReactNode } from "react";
import { LogsLastKnownBootstrapScript } from "@/components/ui/LogsLastKnownState";

export default function LogsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LogsLastKnownBootstrapScript />
      {children}
    </>
  );
}
