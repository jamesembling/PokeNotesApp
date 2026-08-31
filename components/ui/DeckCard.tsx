import Link from "next/link";
import { ChevronIcon } from "@/components/ui/icons";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { ItemTitle } from "@/components/ui/Typography";
import { formatAppCalendarDate } from "@/lib/date-time";
import type { DeckSummary } from "@/types/index";
import styles from "@/components/ui/deck-strategy/collection.module.css";

export type DeckCardView = "tile" | "list";
type DeckCardDeck = Pick<DeckSummary, "id" | "deckName" | "deckPokemon" | "updatedAt">;

type DeckCardProps = {
  deck: DeckCardDeck;
  deckListCount: number;
  gamesPlayed: number;
  recordLabel: string;
  view?: DeckCardView;
  winRate: number | null;
};

export function DeckCard({
  deck,
  deckListCount,
  gamesPlayed,
  recordLabel,
  view = "tile",
  winRate
}: DeckCardProps) {
  const winRateLabel = winRate == null ? "—" : `${winRate}%`;

  if (view === "list") {
    return (
      <Link
        className={`${styles.row} ${styles.columns}`}
        href={`/decks/${deck.id}`}
        prefetch={false}
      >
        <div className={styles.identity}>
          <SpriteStrip
            className={styles.listSprites}
            pokemonOptions={null}
            size="lg"
            sprites={deck.deckPokemon}
          />
          <div className={styles.identityText}>
            <ItemTitle as="h2" className={styles.deckName}>{deck.deckName}</ItemTitle>
            <p className={styles.matchCount}>
              {gamesPlayed > 0 ? `${gamesPlayed} logged matches` : "No linked battle logs"}
            </p>
          </div>
        </div>

        <div className={styles.listWinRate}>{winRateLabel}</div>

        <div className={styles.listNumber}>
          {gamesPlayed > 0 ? recordLabel : "No logs yet"}
        </div>

        <div className={styles.listNumber}>{deckListCount}</div>

        <div className={styles.updated}>{formatAppCalendarDate(deck.updatedAt)}</div>

        <ChevronIcon className={styles.chevron} />
      </Link>
    );
  }

  return (
    <Link className={styles.tile} href={`/decks/${deck.id}`} prefetch={false}>
      <div className={styles.tileTop}>
        <SpriteStrip
          className={styles.tileSprites}
          pokemonOptions={null}
          size="lg"
          sprites={deck.deckPokemon}
        />
        <ChevronIcon className={styles.chevron} />
      </div>

      <div>
        <ItemTitle as="h2" className={styles.tileName}>{deck.deckName}</ItemTitle>
        <p className={styles.matchCount}>
          {gamesPlayed > 0 ? `${gamesPlayed} logged matches` : "No linked battle logs"}
        </p>
      </div>

      <dl className={styles.tileNumbers}>
        <div>
          <dt>Win rate</dt>
          <dd className={styles.tileWinRate}>{winRateLabel}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd>{gamesPlayed > 0 ? recordLabel : "—"}</dd>
        </div>
        <div>
          <dt>Deck lists</dt>
          <dd>{deckListCount}</dd>
        </div>
      </dl>

      <p className={styles.tileUpdated}>Updated {formatAppCalendarDate(deck.updatedAt)}</p>
    </Link>
  );
}
