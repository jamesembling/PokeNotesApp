import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

type SharedLogPageProps = {
  params: {
    token: string;
  };
};

export default async function SharedLogPage({ params }: SharedLogPageProps) {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Shared Battle Log" }]}
          title="Shared Battle Log"
          subtitle={`Viewing shared battle log token ${params.token}.`}
        />

        <Card>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Shared Battle Log</h2>
        </Card>
      </div>
    </main>
  );
}
