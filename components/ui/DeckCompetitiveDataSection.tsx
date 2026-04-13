import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { getDeckCompetitiveStats } from "@/lib/decks/competitive-data";

type DeckCompetitiveDataSectionProps = {
  deckPokemon: string[];
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

function formatRecord(wins: number, losses: number, ties: number) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function buildTournamentStandingsUrl(tournamentId: string) {
  return `https://play.limitlesstcg.com/tournament/${tournamentId}/standings`;
}

function formatOrdinal(value: number) {
  const absValue = Math.abs(value);
  const lastTwoDigits = absValue % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${value}th`;
  }

  switch (absValue % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function StatTile({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3">
      <p className="ui-eyebrow">{label}</p>
      <p className="mt-1 font-display text-[1.4rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

export async function DeckCompetitiveDataSection({
  deckPokemon
}: DeckCompetitiveDataSectionProps) {
  const competitiveStats = await getDeckCompetitiveStats(deckPokemon);

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="ui-eyebrow">Competitive Data</p>
          <h2 className="font-display text-[1.55rem] font-semibold tracking-[-0.045em] text-[var(--text-primary)]">
            Recent online Limitless performance
          </h2>
          <p className="max-w-[65ch] text-sm leading-6 text-[var(--text-secondary)]">
            Public decklist-backed results from recent online Standard tournaments over the last{" "}
            {competitiveStats.sampleDays} days, served from our cached snapshot.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[25rem]">
          <StatTile
            label="Appearances"
            value={competitiveStats.status === "ok" ? String(competitiveStats.appearanceCount) : "--"}
          />
          <StatTile
            label="Best finish"
            value={
              competitiveStats.status === "ok" && competitiveStats.bestFinish
                ? formatOrdinal(competitiveStats.bestFinish)
                : "--"
            }
          />
          <StatTile
            label="Top cut"
            value={
              competitiveStats.status === "ok"
                ? String(competitiveStats.topCutCount)
                : "--"
            }
          />
        </div>
      </div>

      {competitiveStats.status === "unavailable" ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Competitive data is temporarily unavailable because the local snapshot could not be read.
        </p>
      ) : competitiveStats.status === "empty" ? (
        <p className="text-sm text-[var(--text-secondary)]">
          No cached competitive data matched this deck&apos;s selected Pokemon yet.
        </p>
      ) : (
        <>
          <div className="rounded-2xl border border-[var(--border)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <p className="ui-eyebrow">Best recent results</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Top {competitiveStats.results.length} finishes with a public decklist.
                </p>
                {competitiveStats.syncedAt ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Synced {formatDate(competitiveStats.syncedAt)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {competitiveStats.results.map((result) => (
                <div
                  className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                  key={`${result.tournamentId}-${result.playerId}`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                        {formatOrdinal(result.placing)} {result.playerName}
                      </p>
                      <span className="text-sm text-[var(--text-muted)]">
                        {formatRecord(result.wins, result.losses, result.ties)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      <Link
                        className="transition hover:text-[var(--color-brand)]"
                        href={buildTournamentStandingsUrl(result.tournamentId)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {result.tournamentName}
                      </Link>{" "}
                      · {result.tournamentPlayers} players ·{" "}
                      {formatDate(result.tournamentDate)}
                    </p>
                  </div>

                  <Link
                    className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
                    href={result.decklistUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open decklist
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
