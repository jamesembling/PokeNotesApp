import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function StatsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Stats" }]}
        title="Stats"
        subtitle="Your aggregated performance views will live here."
      />

      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          Stats queries will be added as server components against the normalized schema.
        </p>
      </Card>
    </>
  );
}
