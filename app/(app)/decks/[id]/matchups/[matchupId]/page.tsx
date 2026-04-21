import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineDeckMatchupHeaderControls } from "@/components/ui/InlineDeckMatchupHeaderControls";
import { InlineDeckMatchupEditor } from "@/components/ui/InlineDeckMatchupEditor";
import { LazyDeckMatchupEditorButton } from "@/components/ui/LazyDeckMatchupEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { requireUser } from "@/lib/auth";
import { getDeckWithMatchup } from "@/lib/db/decks";

type DeckMatchupPageProps = {
  params: Promise<{
    id: string;
    matchupId: string;
  }>;
};

export default async function DeckMatchupPage({ params }: DeckMatchupPageProps) {
  const user = await requireUser();
  const { id, matchupId } = await params;
  const result = await getDeckWithMatchup(user.id, id, matchupId);

  if (!result) {
    return (
      <PageWidth size="standard">
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Deck Strategy", href: "/decks" },
            { label: "Not Found" }
          ]}
          title="Matchup not found"
          subtitle="This matchup could not be found or you do not have access to it."
        />

        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              The requested matchup is unavailable.
            </p>
            <Link href={`/decks/${id}`}>
              <Button variant="secondary">Back to Deck</Button>
            </Link>
          </div>
        </Card>
      </PageWidth>
    );
  }

  const { deckName, matchup } = result;
  return (
    <PageWidth size="standard">
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Deck Strategy", href: "/decks" },
          { label: deckName, href: `/decks/${id}` },
          { label: matchup.deckName }
        ]}
        title=""
      />

      <Card>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <SpriteStrip maxVisible={2} size="xl" sprites={matchup.deckPokemon} />
              <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)] sm:text-4xl">
                {matchup.deckName}
              </h1>
            </div>

            <div className="lg:shrink-0">
              <div className="flex flex-wrap items-center gap-3">
                <LazyDeckMatchupEditorButton
                  deckId={id}
                  matchup={matchup}
                  triggerLabel="Edit Matchup"
                  triggerVariant="secondary"
                />
                <Link href={`/decks/${id}`}>
                  <Button variant="secondary">Back to Deck</Button>
                </Link>
              </div>
            </div>
          </div>

          <InlineDeckMatchupHeaderControls deckId={id} matchup={matchup} />
        </div>
      </Card>
      <InlineDeckMatchupEditor deckId={id} matchup={matchup} />
    </PageWidth>
  );
}
