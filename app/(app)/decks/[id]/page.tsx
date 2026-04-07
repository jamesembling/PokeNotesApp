import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DeckEditorDialog } from "@/components/ui/DeckEditorDialog";
import { DeckListEditorDialog } from "@/components/ui/DeckListEditorDialog";
import { LogRow } from "@/components/ui/LogRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { StatCard } from "@/components/ui/StatCard";
import { requireUser } from "@/lib/auth";
import { getDeckById, getDeckLogStats } from "@/lib/db/decks";
import { getPokemonOptions } from "@/lib/db/pokemon";
import { getLogsForDeck } from "@/lib/db/logs";

type DeckDetailPageProps = {
  params: {
    id: string;
  };
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

function StrategySection({
  kicker,
  children
}: {
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
          {kicker}
        </p>
        {children}
      </div>
    </Card>
  );
}

export default async function DeckDetailPage({ params }: DeckDetailPageProps) {
  const user = await requireUser();
  const defaultCreatedBy =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer";

  const [deck, stats, pokemonOptions] = await Promise.all([
    getDeckById(user.id, params.id),
    getDeckLogStats(user.id, params.id),
    getPokemonOptions()
  ]);

  if (!deck) {
    return (
      <>
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Deck Strategy", href: "/decks" },
            { label: "Not Found" }
          ]}
          title="Deck not found"
          subtitle="This deck could not be found or you do not have access to it."
        />

        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              The requested deck strategy is unavailable.
            </p>
            <Link
              className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
              href="/decks"
            >
              Back to Decks
            </Link>
          </div>
        </Card>
      </>
    );
  }

  const relatedLogs = await getLogsForDeck(user.id, deck.id, [deck]);
  const recentWins = relatedLogs.filter((log) => log.result === "Win").length;
  const recentLosses = relatedLogs.filter((log) => log.result === "Loss").length;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Deck Strategy", href: "/decks" },
          { label: deck.deckName }
        ]}
        title={deck.deckName}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <DeckListEditorDialog
              deckId={deck.id}
              defaultCreatedBy={defaultCreatedBy}
              defaultFormat={deck.format}
              triggerLabel="Add Deck List"
              triggerVariant="secondary"
            />
            <DeckEditorDialog
              deck={deck}
              pokemonOptions={pokemonOptions}
              triggerLabel="Edit Deck"
              triggerVariant="secondary"
            />
            <Link
              className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
              href="/decks"
            >
              Back to Decks
            </Link>
          </div>
        }
      />

      <Card>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SpriteStrip maxVisible={3} size="md" sprites={deck.deckPokemon} />

            <div className="flex flex-wrap gap-2">
              <Badge>{deck.format}</Badge>
              {deck.goPreference ? <Badge>Prefers {deck.goPreference}</Badge> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard label="Total Games" value={stats.total} />
            <StatCard label="Wins" value={stats.wins} valueColor="win" />
            <StatCard label="Losses" value={stats.losses} valueColor="loss" />
          </div>
        </div>
      </Card>

      {deck.coreStrategy ? (
        <StrategySection kicker="CORE STRATEGY">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {deck.coreStrategy}
          </p>
        </StrategySection>
      ) : null}

      {deck.generalNotes ? (
        <StrategySection kicker="GENERAL NOTES">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {deck.generalNotes}
          </p>
        </StrategySection>
      ) : null}

      {deck.resourcePlan ? (
        <StrategySection kicker="RESOURCE PLAN">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {deck.resourcePlan}
          </p>
        </StrategySection>
      ) : null}

      {deck.setupGoals.length > 0 ? (
        <StrategySection kicker="SETUP GOALS">
          <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
            {deck.setupGoals.map((goal, index) => (
              <li key={`${goal}-${index}`}>{goal}</li>
            ))}
          </ul>
        </StrategySection>
      ) : null}

      <Card className="space-y-4" id="deck-lists">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
          DECK LISTS
        </p>

        {deck.deckLists.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No deck lists saved.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {deck.deckLists.map((deckList) => (
              <div
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                key={deckList.id}
              >
                <div className="space-y-1">
                  <p className="text-base font-semibold text-[var(--text-primary)]">
                    {deckList.name}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {deckList.format}
                    {deckList.date ? ` · ${formatDate(deckList.date)}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <DeckListEditorDialog
                    deckId={deck.id}
                    deckList={deckList}
                    defaultCreatedBy={defaultCreatedBy}
                    defaultFormat={deck.format}
                    triggerLabel="Edit List"
                    triggerVariant="ghost"
                  />
                  <Link
                    className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
                    href={`/decks/${deck.id}/lists/${deckList.id}`}
                  >
                    View List
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
              BATTLE LOGS
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Recent battle logs linked to this strategy or matched to its archetype.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge>{stats.total} logs</Badge>
            <Badge>{stats.wins} wins</Badge>
            <Badge>{stats.losses} losses</Badge>
          </div>
        </div>

        {relatedLogs.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No linked battle logs yet for this deck.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {relatedLogs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>

            <p className="text-sm text-[var(--text-muted)]">
              Showing the latest {relatedLogs.length} linked log
              {relatedLogs.length === 1 ? "" : "s"}.
              {stats.total > relatedLogs.length
                ? ` ${recentWins}-${recentLosses} in this preview, ${stats.wins}-${stats.losses} overall.`
                : ` ${stats.wins}-${stats.losses} overall.`}
            </p>
          </>
        )}
      </Card>
    </>
  );
}
