import type { Metadata } from "next";
import { PublicLogsCanaryClient } from "@/components/ui/PublicLogsCanaryClient";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false
  },
  title: "Battle Logs | Poke Notes"
};

export default function PublicLogsCanaryPage() {
  return <PublicLogsCanaryClient />;
}
