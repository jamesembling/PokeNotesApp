import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function CalculatorPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Probability Calculator" }
        ]}
        title="Probability Calculator"
        subtitle="Deck math tools and probability helpers will appear here."
      />

      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          Probability workflows are scaffolded and ready for server-driven calculations.
        </p>
      </Card>
    </>
  );
}
