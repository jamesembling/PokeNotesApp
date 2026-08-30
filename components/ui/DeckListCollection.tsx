import Link from "next/link";
import { ChevronIcon } from "@/components/ui/icons";
import { ItemTitle } from "@/components/ui/Typography";
import { formatAppCalendarDate } from "@/lib/date-time";
import type { DeckListUsageCount } from "@/lib/db/deck-lists";
import type { DeckList } from "@/types/index";
import styles from "./deck-list/collection.module.css";

const COUNT_FORMATTER = new Intl.NumberFormat("en-GB");

export function DeckListCollectionHeader() {
  return (
    <div aria-hidden="true" className={`${styles.columns} ${styles.listHeader}`}>
      <span>Deck List</span>
      <span className={styles.center}>Format</span>
      <span className={styles.center}>Battle Logs</span>
      <span className={styles.center}>W/L</span>
      <span className={styles.center}>Tournaments</span>
      <span className={styles.alignEnd}>Updated</span>
      <span />
    </div>
  );
}

export function DeckListCollection({
  deckLists,
  usageCounts
}: {
  deckLists: readonly DeckList[];
  usageCounts: ReadonlyMap<string, DeckListUsageCount>;
}) {
  return (
    <div className={styles.collection}>
      {deckLists.length === 0 ? (
        <p className={styles.empty}>No Deck Lists saved yet.</p>
      ) : (
        <>
          <DeckListCollectionHeader />
          <ul aria-label="Saved Deck Lists" role="list">
            {deckLists.map((deckList) => {
              const usage = usageCounts.get(deckList.id) ?? {
                battleLogs: 0, losses: 0, tournaments: 0, wins: 0
              };
              const updated = formatAppCalendarDate(deckList.updatedAt);
              const format = deckList.format || "—";

              return (
                <li key={`${deckList.deckId ?? "standalone"}:${deckList.id}`}>
                  <Link
                    className={`${styles.columns} ${styles.row}`}
                    href={deckList.deckId
                      ? `/deck-lists/${deckList.id}?deckId=${encodeURIComponent(deckList.deckId)}`
                      : `/deck-lists/${deckList.id}`}
                    prefetch={false}
                  >
                    <div className={styles.identity}>
                      <ItemTitle as="h2" className={styles.name} size="sm">{deckList.name}</ItemTitle>
                      <p className={styles.compactMeta}>
                        <span><span className="sr-only">Format: </span>{format}</span>
                        <span>Updated {updated}</span>
                      </p>
                    </div>
                    <p className={styles.format}><span className="sr-only">Format: </span>{format}</p>
                    <UsageValue label="Battle Logs" value={COUNT_FORMATTER.format(usage.battleLogs)} />
                    <UsageValue label="W/L" value={`${COUNT_FORMATTER.format(usage.wins)}-${COUNT_FORMATTER.format(usage.losses)}`} />
                    <UsageValue label="Tournaments" value={COUNT_FORMATTER.format(usage.tournaments)} />
                    <p className={styles.updated}><span className="sr-only">Updated: </span>{updated}</p>
                    <ChevronIcon aria-hidden="true" className={styles.chevron} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function UsageValue({ label, value }: { label: string; value: string }) {
  return (
    <p className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </p>
  );
}
