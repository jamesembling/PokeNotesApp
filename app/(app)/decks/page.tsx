import { Card } from "@/components/ui/Card";
import { DeckCard } from "@/components/ui/DeckCard";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getDeckLogSnapshots } from "@/lib/db/logs";
import { getDecks } from "@/lib/db/decks";

export default async function DecksPage() {
  const user = await requireUser();
  const decks = await getDecks(user.id);
  const deckLogSnapshots = await getDeckLogSnapshots(user.id, decks);
  const deckCardData = decks.map((deck) => {
    const stats = deckLogSnapshots.get(deck.id)?.stats ?? {
      total: 0,
      wins: 0,
      losses: 0
    };
    const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

    return {
      deck,
      gamesPlayed: stats.total,
      deckListCount: deck.deckLists.length,
      losses: stats.losses,
      winRate: stats.total > 0 ? winRate : null,
      winRateLabel: stats.total > 0 ? `${winRate}% (${stats.wins}-${stats.losses})` : "No logs yet"
    };
  });
  const trackedDecksCount = deckCardData.filter(({ gamesPlayed }) => gamesPlayed > 0).length;
  const averageWinRate =
    trackedDecksCount > 0
      ? Math.round(
          deckCardData.reduce((total, { winRate }) => total + (winRate ?? 0), 0) / trackedDecksCount
        )
      : null;
  const totalDeckLists = deckCardData.reduce(
    (total, { deckListCount }) => total + deckListCount,
    0
  );
  const mostActiveDeck = deckCardData.reduce<(typeof deckCardData)[number] | null>((current, deckCard) => {
    if (!current || deckCard.gamesPlayed > current.gamesPlayed) {
      return deckCard;
    }

    return current;
  }, null);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
        showDivider={false}
        title="Deck Strategy"
        subtitle="A sharper view of your active decks, linked lists, and battle performance."
        action={<LazyDeckEditorButton triggerLabel="New Deck" />}
      />

      {decks.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">No decks saved yet.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden p-0">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.8fr)]">
              <div className="border-b border-[var(--border)] px-5 py-5 sm:px-6 lg:border-b-0 lg:border-r lg:py-6">
                <p className="ui-eyebrow">Deck Overview</p>
                <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="space-y-2">
                    <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[2rem]">
                      {trackedDecksCount > 0
                        ? `${trackedDecksCount} tracked decks ready to review`
                        : "Start linking battle logs to turn this into a live deck board"}
                    </h2>
                    <p className="max-w-[58ch] text-sm leading-7 text-[var(--text-secondary)]">
                      Scan your strongest performers, spot neglected lists, and jump straight into
                      the decks that need attention.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 self-start md:min-w-[18rem]">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3">
                      <p className="ui-eyebrow">Saved decks</p>
                      <p className="mt-1 font-display text-[1.5rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                        {deckCardData.length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3">
                      <p className="ui-eyebrow">Deck lists</p>
                      <p className="mt-1 font-display text-[1.5rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                        {totalDeckLists}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 bg-[var(--bg-surface-alt)] px-5 py-5 sm:px-6 lg:py-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="ui-eyebrow">Performance snapshot</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {averageWinRate == null
                        ? "No linked battle data yet."
                        : `Average win rate across tracked decks is ${averageWinRate}%.`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[2rem] font-semibold tracking-[-0.05em] text-[var(--text-primary)]">
                      {averageWinRate == null ? "--" : `${averageWinRate}%`}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
                  <p className="ui-eyebrow">Most active deck</p>
                  <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                    {mostActiveDeck && mostActiveDeck.gamesPlayed > 0
                      ? `${mostActiveDeck.deck.deckName} (${mostActiveDeck.gamesPlayed} matches)`
                      : "No match volume yet"}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
            {deckCardData.map(({ deck, deckListCount, gamesPlayed, losses, winRate, winRateLabel }) => (
              <DeckCard
                deck={deck}
                deckListCount={deckListCount}
                gamesPlayed={gamesPlayed}
                key={deck.id}
                recordLabel={gamesPlayed > 0 ? `${gamesPlayed - losses}-${losses}` : "No record"}
                winRate={winRate}
                winRateLabel={winRateLabel}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
