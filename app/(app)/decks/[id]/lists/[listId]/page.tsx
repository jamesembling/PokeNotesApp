import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DeckListCard } from "@/components/ui/DeckListCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getDeckWithList } from "@/lib/db/decks";

type DeckListPageProps = {
  params: {
    id: string;
    listId: string;
  };
};

type ParsedCard = {
  count: number;
  name: string;
  set: string;
  number: string;
  category: string;
};

function formatCardNumber(number: string): string {
  const match = number.match(/^([A-Za-z]*)(\d+)([A-Za-z]*)$/);

  if (match) {
    const [, prefix, digits, suffix] = match;
    return `${prefix}${digits.padStart(3, "0")}${suffix}`;
  }

  return number;
}

function buildCardImageUrls(set: string, number: string) {
  const formattedNumber = formatCardNumber(number);

  return {
    imageUrl: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${set}/${set}_${formattedNumber}_R_EN_SM.png`
  };
}

function buildCardUrl(set: string, number: string) {
  return `https://limitlesstcg.com/cards/${set}/${number}`;
}

function sortParsedCards(cards: ParsedCard[]): ParsedCard[] {
  const pokemon = cards
    .filter((c) => c.category === "Pokemon")
    .sort((a, b) => b.count - a.count);
  const trainer = cards
    .filter((c) => c.category === "Trainer")
    .sort((a, b) => b.count - a.count);
  const energy = cards
    .filter((c) => c.category === "Energy")
    .sort((a, b) => b.count - a.count);
  const unknown = cards.filter(
    (c) => c.category === "Unknown" || !["Pokemon", "Trainer", "Energy"].includes(c.category)
  );

  return [...pokemon, ...trainer, ...energy, ...unknown];
}

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

  const { deck, deckList } = result;
  const sortedCards = sortParsedCards(deckList.parsedCards as ParsedCard[]);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Deck Strategy", href: "/decks" },
          { label: deck.deckName, href: `/decks/${params.id}` },
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
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {sortedCards.map((card, index) => {
              const { imageUrl } = buildCardImageUrls(card.set, card.number);

              return (
                <DeckListCard
                  cardUrl={buildCardUrl(card.set, card.number)}
                  count={card.count}
                  imageUrl={imageUrl}
                  key={`${card.set}-${card.number}-${index}`}
                  name={card.name}
                />
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
