import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function DecksPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
        title="Deck Strategy"
        subtitle="Saved deck plans, lists, and matchup notes will appear here."
      />

      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          Deck strategy management is scaffolded and ready for server-side data work.
        </p>
      </Card>
    </>
  );
}
