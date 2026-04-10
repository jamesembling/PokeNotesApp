import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LazyTournamentEditorButton } from "@/components/ui/LazyTournamentEditorButton";
import { LazyTournamentRoundEditorButton } from "@/components/ui/LazyTournamentRoundEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { TournamentRoundRow } from "@/components/ui/TournamentRoundRow";
import { TournamentSchemaNotice } from "@/components/ui/TournamentSchemaNotice";
import { requireUser } from "@/lib/auth";
import {
  getTournamentById,
  getTournamentDeckChoices,
  getTournamentRounds,
  TournamentSchemaMissingError
} from "@/lib/db/tournaments";
import { formatTournamentDateRange, getTournamentRecord } from "@/lib/tournaments/display";
import { getTournamentCategoryLabel, getTournamentPlacementLabel } from "@/lib/tournaments/options";

type TournamentDetailPageProps = {
  params: {
    id: string;
  };
};

export default async function TournamentDetailPage({ params }: TournamentDetailPageProps) {
  const user = await requireUser();
  let tournament = null;
  let rounds = [];
  let decks = [];

  try {
    [tournament, rounds, decks] = await Promise.all([
      getTournamentById(user.id, params.id),
      getTournamentRounds(user.id, params.id),
      getTournamentDeckChoices(user.id)
    ]);
  } catch (error) {
    if (error instanceof TournamentSchemaMissingError) {
      return (
        <PageWidth size="standard">
          <PageHeader
            breadcrumb={[
              { label: "Poke Notes", href: "/" },
              { label: "Tournaments", href: "/tournaments" },
              { label: "Setup Required" }
            ]}
            title="Tournaments"
            subtitle="This route is ready in the app, but the database migration still needs to run."
          />
          <TournamentSchemaNotice />
        </PageWidth>
      );
    }

    throw error;
  }

  if (!tournament) {
    return (
      <PageWidth size="standard">
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Tournaments", href: "/tournaments" },
            { label: "Not Found" }
          ]}
          title="Tournament not found"
          subtitle="This tournament could not be found or you do not have access to it."
        />

        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              The requested tournament is unavailable.
            </p>
            <Link
              className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
              href="/tournaments"
            >
              Back to Tournaments
            </Link>
          </div>
        </Card>
      </PageWidth>
    );
  }

  const record = getTournamentRecord(rounds);

  return (
    <PageWidth size="standard">
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Tournaments", href: "/tournaments" },
          { label: tournament.name }
        ]}
        title={tournament.name}
        subtitle={formatTournamentDateRange(tournament.dateFrom, tournament.dateTo)}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <LazyTournamentEditorButton
              decks={decks}
              tournament={tournament}
              triggerLabel="Edit Tournament"
              triggerVariant="secondary"
            />
            <Link
              className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
              href="/tournaments"
            >
              Back to Tournaments
            </Link>
          </div>
        }
      />

      <Card>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <SpriteStrip maxVisible={3} size="xl" sprites={tournament.deckSprites} />
              <div className="space-y-1">
                <p className="ui-eyebrow">Deck</p>
                <p className="font-display text-[1.15rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                  {tournament.deckName}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge>{record}</Badge>
              {tournament.category ? <Badge>{getTournamentCategoryLabel(tournament.category)}</Badge> : null}
              {tournament.placement ? (
                <Badge>{getTournamentPlacementLabel(tournament.placement)}</Badge>
              ) : null}
              {tournament.format ? <Badge>{tournament.format}</Badge> : null}
            </div>
          </div>

          {tournament.notes ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-4">
              <p className="ui-eyebrow">Tournament Notes</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
                {tournament.notes}
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="ui-eyebrow">Rounds</p>
            <h2 className="font-display text-[1.3rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
              Tournament Rounds
            </h2>
          </div>

          <LazyTournamentRoundEditorButton
            suggestedRoundNumber={rounds.length + 1}
            tournamentId={tournament.id}
            triggerLabel="Add Round"
          />
        </div>

        {rounds.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface-alt)] p-6">
            <p className="text-sm text-[var(--text-secondary)]">
              No rounds recorded yet. Add round one to start tracking the run.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {rounds.map((round) => (
              <TournamentRoundRow
                canEdit
                key={round.id}
                round={round}
                tournamentId={tournament.id}
              />
            ))}
          </div>
        )}
      </Card>
    </PageWidth>
  );
}
