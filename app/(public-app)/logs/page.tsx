import type { Metadata } from "next";
import { LogsBootstrapClient } from "@/components/ui/LogsBootstrapClient";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false
  },
  title: "Battle Logs | Poke Notes"
};

export default function PublicLogsPage() {
  return <LogsBootstrapClient performanceVariant="logs-public-shell" />;
}
