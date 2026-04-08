import { DeckListCard } from "@/components/ui/DeckListCard";
import { buildDeckListCardImageUrl, buildDeckListCardUrl } from "@/lib/deck-lists/render";
import type { DeckCard } from "@/types/index";

type DeckListVisualGridProps = {
  cards: DeckCard[];
};

export function DeckListVisualGrid({ cards }: DeckListVisualGridProps) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12">
      {cards.map((card, index) => (
        <DeckListCard
          cardUrl={buildDeckListCardUrl(card.set, card.number)}
          count={card.count}
          imageUrl={buildDeckListCardImageUrl(card.set, card.number)}
          key={`${card.set}-${card.number}-${index}`}
          name={card.name}
        />
      ))}
    </div>
  );
}
