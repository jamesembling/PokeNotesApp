import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/AppShell";

export default function PublicLogsCanaryLayout({ children }: { children: ReactNode }) {
  return <AppShell waitForBootstrapBeforeProfile>{children}</AppShell>;
}
