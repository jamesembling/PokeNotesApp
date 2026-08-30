import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { SectionTitle } from "@/components/ui/Typography";
import { formatAppCalendarDate } from "@/lib/date-time";
import type { DeckList } from "@/types/index";
import styles from "./deck-list/profile.module.css";

type DeckListProfileProps = {
  deckList: DeckList;
  strategyName?: string;
  associationControl?: ReactNode;
};

export function DeckListProfile({ deckList, strategyName, associationControl }: DeckListProfileProps) {
  const composition = deckList.sortedCards.reduce((counts, card) => {
    const category = String(card.category ?? "").trim().toLowerCase();
    counts.total += card.count;
    if (category === "pokemon" || category === "pokémon") counts.pokemon += card.count;
    else if (category === "trainer") counts.trainers += card.count;
    else if (category === "energy") counts.energy += card.count;
    else counts.other += card.count;
    return counts;
  }, { total: 0, pokemon: 0, trainers: 0, energy: 0, other: 0 });
  const hasCards = deckList.sortedCards.length > 0;
  const hasDate = deckList.date && !Number.isNaN(Date.parse(deckList.date));

  return (
    <div className={styles.profile}>
      <div className={styles.compositionRow}>
        {hasCards ? (
          <dl aria-label="Deck composition" className={styles.composition}>
            <div><dt>Cards</dt><dd>{composition.total}</dd></div>
            <div><dt>Pokémon</dt><dd>{composition.pokemon}</dd></div>
            <div><dt>Trainers</dt><dd>{composition.trainers}</dd></div>
            <div><dt>Energy</dt><dd>{composition.energy}</dd></div>
            {composition.other > 0 ? <div><dt>Uncategorised</dt><dd>{composition.other}</dd></div> : null}
          </dl>
        ) : <p className={styles.muted}>Card count unavailable</p>}
        <CopyDeckListButton text={deckList.rawList} />
      </div>

      <div className={styles.layout}>
        <section aria-label="Deck List cards" className={styles.artwork}>
          {hasCards ? (
            <DeckListVisualGrid cards={deckList.sortedCards} className={styles.galleryGrid} />
          ) : (
            <div className={styles.emptyCards}>
              <SectionTitle size="sm">No card preview yet</SectionTitle>
              <p>Edit the list to add card quantities, names, set codes and numbers. Your original list text is preserved.</p>
            </div>
          )}
        </section>

        <aside aria-label="Deck List profile" className={styles.details}>
          <section>
            <SectionTitle size="sm">List details</SectionTitle>
            <dl className={styles.metadata}>
              <div><dt>Format</dt><dd>{deckList.format || "Not set"}</dd></div>
              <div><dt>Date</dt><dd>{hasDate ? <time dateTime={deckList.date}>{formatAppCalendarDate(deckList.date)}</time> : "Not set"}</dd></div>
              <div><dt>Created by</dt><dd>{deckList.createdBy || "Not set"}</dd></div>
            </dl>
          </section>

          <section className={styles.strategy}>
            <SectionTitle size="sm">Deck Strategy</SectionTitle>
            {deckList.deckId ? (
              <Link className={styles.strategyLink} href={`/decks/${deckList.deckId}`} prefetch={false}>
                <span>{strategyName || "View linked strategy"}</span>
                <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            ) : (
              <p className={styles.standalone}>Standalone list</p>
            )}
            {associationControl}
          </section>
        </aside>
      </div>
    </div>
  );
}
