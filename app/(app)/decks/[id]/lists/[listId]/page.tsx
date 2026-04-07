import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { sortDeckListCards } from "@/lib/deck-lists/sort";
import { getDeckWithList } from "@/lib/db/decks";

type DeckListPageProps = {
  params: {
    id: string;
    listId: string;
  };
};

export default async function DeckListPage({ params }: DeckListPageProps) {
  const user = await requireUser();
  const result = await getDeckWithList(user.id, params.id, params.listId);

  if (!result) {
    return (
      <>
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Deck Strategy", href: "/decks" },
            { label: "Not Found" }
          ]}
          title="Deck list not found"
          subtitle="This deck list could not be found or you do not have access to it."
        />

        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              The requested deck list is unavailable.
            </p>
            <Link
              className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
              href={`/decks/${params.id}`}
            >
              Back to Deck
            </Link>
          </div>
        </Card>
      </>
    );
  }

  const { deckName, deckList } = result;
  const sortedCards = await sortDeckListCards(deckList.parsedCards);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Deck Strategy", href: "/decks" },
          { label: deckName, href: `/decks/${params.id}` },
          { label: deckList.name }
        ]}
        title={deckList.name}
        action={
          <Link href={`/decks/${params.id}`}>
            <Button variant="secondary">Back to Deck</Button>
          </Link>
        }
      />

      <Card className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
          DECK LIST
        </p>

        {deckList.parsedCards.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No parsed cards are available for this deck list yet.
          </p>
        ) : (
          <DeckListVisualGrid cards={sortedCards} />
        )}
      </Card>
    </>
  );
}
