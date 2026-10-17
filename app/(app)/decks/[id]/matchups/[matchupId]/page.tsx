import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { MatchupViewedVersionProvider } from "@/components/hooks/useMatchupViewedVersion";
import { InlineDeckMatchupHeaderControls } from "@/components/ui/InlineDeckMatchupHeaderControls";
import { InlineDeckMatchupEditor } from "@/components/ui/InlineDeckMatchupEditor";
import { LazyDeckMatchupEditorButton } from "@/components/ui/LazyDeckMatchupEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import { PageWidth } from "@/components/ui/PageWidth";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { DetailTitle } from "@/components/ui/Typography";
import headerStyles from "@/components/ui/deck-strategy/matchup-header.module.css";
import styles from "@/components/ui/deck-strategy/strategy.module.css";
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
      <div className="hidden sm:block">
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Deck Strategy", href: "/decks" },
            { label: deckName, href: `/decks/${id}` },
            { label: matchup.deckName }
          ]}
        />
      </div>

      <section className={styles.deckHeader}>
        <Button asChild className="sm:hidden" size="icon-lg" variant="ghost">
          <Link aria-label={`Back to ${deckName} strategy`} href={`/decks/${id}`} prefetch={false}>
            <ArrowLeft className="size-6" />
          </Link>
        </Button>
        <SpriteStrip
          className="min-h-10 shrink-0 sm:hidden"
          maxVisible={2}
          size="md"
          sprites={matchup.deckPokemon}
        />
        <SpriteStrip
          className="hidden min-h-14 shrink-0 sm:flex"
          maxVisible={2}
          size="xl"
          sprites={matchup.deckPokemon}
        />
        <div className={styles.deckIdentity}>
          <DetailTitle className={styles.deckTitle} size="sm">{matchup.deckName}</DetailTitle>
          <p className={headerStyles.parentDeck}>
            Matchup for <Link href={`/decks/${id}`} prefetch={false}>{deckName}</Link>
          </p>
        </div>

        <div className={`${styles.deckActions} hidden shrink-0 sm:block`}>
          <PageActions>
            <LazyDeckMatchupEditorButton
              deckId={id}
              matchup={matchup}
              triggerLabel="Edit Matchup"
              triggerVariant="outline"
            />
            <Button asChild variant="outline">
              <Link href={`/decks/${id}`} prefetch={false}>
                <ArrowLeft className="size-4" />
                Back to Deck
              </Link>
            </Button>
          </PageActions>
        </div>
        <LazyDeckMatchupEditorButton
          className="size-11 shrink-0 p-0 sm:hidden"
          deckId={id}
          loadingLabel="Edit"
          matchup={matchup}
          triggerLabel="Edit Matchup"
          triggerVariant="ghost"
        >
          <Pencil aria-hidden="true" className="size-4" />
          <span className="sr-only">Edit Matchup</span>
        </LazyDeckMatchupEditorButton>
      </section>

      <MatchupViewedVersionProvider initialVersion={matchup.updatedAt} key={`${id}:${matchup.id}`}>
        <InlineDeckMatchupHeaderControls deckId={id} matchup={matchup} />
        <InlineDeckMatchupEditor deckId={id} matchup={matchup} />
      </MatchupViewedVersionProvider>
    </PageWidth>
  );
}
