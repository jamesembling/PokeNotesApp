import { Card } from "@/components/shadcn/card";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SharedLogNotFound() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Shared Battle Log" }]}
          title="Shared Battle Log"
        />

        <Card>
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-card-foreground">
              Shared log not found
            </h2>
            <p className="text-sm text-muted-foreground">
              This shared battle log link is missing, expired, or no longer available.
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
