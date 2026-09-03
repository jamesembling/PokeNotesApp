import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { BattleReplayPrototype } from "@/components/battle-replay/BattleReplayPrototype";
import { Button } from "@/components/shadcn/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";

export const metadata: Metadata = {
  title: "Battle Replay Prototype | Poke Notes",
  description: "Interactive visual replay prototype for an imported Pokémon TCG battle log."
};

export default function BattleReplayPrototypePage() {
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
          breadcrumb={[{ label: "Battle Logs", href: "/logs" }, { label: "Visual replay prototype" }]}
          subtitle="Step through a synthetic imported match and watch each parsed action update the board. This route is isolated from saved Battle Logs and production data."
          title="Dragapult ex vs Charizard ex"
        />

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-y border-border py-4 text-sm sm:grid-cols-4">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Result</span>
            <strong className="mt-1 block text-win-strong">Win</strong>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Prizes</span>
            <strong className="mt-1 block tabular-nums text-card-foreground">2–1</strong>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Turns</span>
            <strong className="mt-1 block tabular-nums text-card-foreground">3</strong>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Replay source</span>
            <strong className="mt-1 block text-card-foreground">Typed events</strong>
          </div>
        </div>

        <BattleReplayPrototype />
      </PageWidth>
    </main>
  );
}
