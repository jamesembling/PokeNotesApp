import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/AppShell";

export default function PublicLogsLayout({ children }: { children: ReactNode }) {
  return <AppShell waitForBootstrapBeforeProfile>{children}</AppShell>;
}
