import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { BattleReplayPrototype } from "@/components/battle-replay/BattleReplayPrototype";
import { Button } from "@/components/shadcn/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { resolveReplayLocation } from "@/lib/battle-replay/pilots";

export const metadata: Metadata = {
  title: "Battle Replay Prototype | Poke Notes",
  description:
    "Interactive visual replay prototype for an imported Pokémon TCG battle log.",
};

export default async function BattleReplayPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ pilot?: string | string[]; position?: string | string[] }>;
}) {
  const { pilot, position } = await searchParams;
  const initialLocation = resolveReplayLocation(pilot, position);

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <PageWidth size="wide">
        <PageHeader
          action={
            <Button asChild variant="outline">
              <Link href="/logs" prefetch={false}>
                <ArrowLeftIcon />
                Back to Battle Logs
              </Link>
            </Button>
          }
          breadcrumb={[
            { label: "Battle Logs", href: "/logs" },
            { label: "Visual replay prototype" },
          ]}
          subtitle="Switch between real saved Battle Logs and test how their source actions reconstruct the board. Player names are anonymised in this isolated prototype."
          title="Battle replay pilots"
        />

        <BattleReplayPrototype
          initialActionIndex={initialLocation.actionIndex}
          initialPilotId={initialLocation.pilotId}
        />
      </PageWidth>
    </main>
  );
}
