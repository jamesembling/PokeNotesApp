import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";

export default function ReplayLoading() {
  return <PageWidth size="wide">
    <PageHeader breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: "Battle Replay" }]} title="Battle Replay" />
    <p className="text-sm text-muted-foreground" role="status">Loading your Battle Replay…</p>
  </PageWidth>;
}
