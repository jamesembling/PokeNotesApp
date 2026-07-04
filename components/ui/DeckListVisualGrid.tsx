import { DeckListCard } from "@/components/ui/DeckListCard";
import {
  buildDeckListCardImageUrl,
  buildDeckListCardUrl,
  type DeckListCardImageSize
} from "@/lib/deck-lists/render";
import type { DeckCard } from "@/types/index";

type DeckListVisualGridProps = {
  cards: DeckCard[];
  variant?: "standard" | "featured";
};

const variantClasses: Record<NonNullable<DeckListVisualGridProps["variant"]>, string> = {
  standard: "grid-cols-4 sm:grid-cols-6 lg:grid-cols-8",
  featured: "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-7"
};

const variantImageSizes: Record<NonNullable<DeckListVisualGridProps["variant"]>, string> = {
  standard: "(max-width: 640px) 22vw, (max-width: 1024px) 16vw, 120px",
  featured: "(max-width: 640px) 23vw, (max-width: 1024px) 18vw, (max-width: 1536px) 15vw, 180px"
};

const variantImageQuality: Record<NonNullable<DeckListVisualGridProps["variant"]>, number> = {
  standard: 80,
  featured: 95
};

const variantSourceSizes: Record<
  NonNullable<DeckListVisualGridProps["variant"]>,
  DeckListCardImageSize
> = {
  standard: "SM",
  featured: "LG"
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
          imageQuality={variantImageQuality[variant]}
          imageSizes={variantImageSizes[variant]}
          imageUrl={buildDeckListCardImageUrl(card.set, card.number, variantSourceSizes[variant])}
          key={`${card.set}-${card.number}-${index}`}
          name={card.name}
        />
      ))}
    </div>
  );
}
