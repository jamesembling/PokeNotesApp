import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { LogsBootstrapScript } from "@/components/ui/LogsBootstrapScript";

export default function PublicLogsCanaryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LogsBootstrapScript />
      <AppShell waitForBootstrapBeforeProfile>{children}</AppShell>
    </>
  );
}
