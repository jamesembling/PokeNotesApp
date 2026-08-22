import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { InlineDeckMatchupHeaderControls } from "@/components/ui/InlineDeckMatchupHeaderControls";
import { InlineDeckMatchupEditor } from "@/components/ui/InlineDeckMatchupEditor";
import { LazyDeckMatchupEditorButton } from "@/components/ui/LazyDeckMatchupEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import { PageWidth } from "@/components/ui/PageWidth";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { DetailTitle } from "@/components/ui/Typography";
import { requireUser } from "@/lib/auth";
import { getDeckWithMatchup } from "@/lib/db/decks";

type DeckMatchupPageProps = {
  params: Promise<{
    id: string;
    matchupId: string;
  }>;
};

export default async function DeckMatchupPage({ params }: DeckMatchupPageProps) {
  const [user, { id, matchupId }] = await Promise.all([requireUser(), params]);
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
            <p className="text-sm text-foreground">
              The requested matchup is unavailable.
            </p>
            <Link href={`/decks/${id}`} prefetch={false}>
              <Button variant="outline">Back to Deck</Button>
            </Link>
          </div>
        </Card>
      </PageWidth>
    );
  }

  const { deckName, matchup } = result;
  return (
    <PageWidth size="wide">
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Deck Strategy", href: "/decks" },
          { label: deckName, href: `/decks/${id}` },
          { label: matchup.deckName }
        ]}
      />

      <Card>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <SpriteStrip maxVisible={2} size="xl" sprites={matchup.deckPokemon} />
              <DetailTitle>{matchup.deckName}</DetailTitle>
            </div>

            <div className="lg:shrink-0">
              <PageActions>
                <LazyDeckMatchupEditorButton
                  deckId={id}
                  matchup={matchup}
                  triggerLabel="Edit Matchup"
                  triggerVariant="outline"
                />
                <Button asChild variant="outline">
                  <Link href={`/decks/${id}`} prefetch={false}>
                    Back to Deck
                  </Link>
                </Button>
              </PageActions>
            </div>
          </div>

          <InlineDeckMatchupHeaderControls deckId={id} matchup={matchup} />
        </div>
      </Card>
      <InlineDeckMatchupEditor deckId={id} matchup={matchup} />
    </PageWidth>
  );
}
