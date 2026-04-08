import { DeckListCard } from "@/components/ui/DeckListCard";
import { buildDeckListCardImageUrl, buildDeckListCardUrl } from "@/lib/deck-lists/render";
import type { DeckCard } from "@/types/index";

type DeckListVisualGridProps = {
  cards: DeckCard[];
  variant?: "standard" | "featured";
};

const variantClasses: Record<NonNullable<DeckListVisualGridProps["variant"]>, string> = {
  standard: "grid-cols-4 sm:grid-cols-6 lg:grid-cols-8",
  featured: "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-7"
};

export function DeckListVisualGrid({
  cards,
  variant = "standard"
}: DeckListVisualGridProps) {
  return (
    <div className={["grid gap-2", variantClasses[variant]].join(" ")}>
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
