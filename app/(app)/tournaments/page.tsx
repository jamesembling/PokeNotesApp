import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TournamentCard } from "@/components/ui/TournamentCard";
import { TournamentEditorDialog } from "@/components/ui/TournamentEditorDialog";
import { TournamentSchemaNotice } from "@/components/ui/TournamentSchemaNotice";
import { requireUser } from "@/lib/auth";
import {
  getTournamentDeckChoices,
  getTournamentSummaries,
  TournamentSchemaMissingError
} from "@/lib/db/tournaments";
import { getLimitlessTournamentFormatOptions } from "@/lib/tournaments/formats";
import type { DeckSummary, TournamentSummary } from "@/types/index";

export default async function TournamentsPage() {
  const user = await requireUser();
  let tournaments: TournamentSummary[] = [];
  let decks: DeckSummary[] = [];
  const formatOptions = await getLimitlessTournamentFormatOptions();
  const formatLabelMap = new Map(formatOptions.map((option) => [option.value, option.label]));
  let schemaMissing = false;

  try {
    [tournaments, decks] = await Promise.all([
      getTournamentSummaries(user.id),
      getTournamentDeckChoices(user.id)
    ]);
  } catch (error) {
    if (error instanceof TournamentSchemaMissingError) {
      schemaMissing = true;
      decks = await getTournamentDeckChoices(user.id);
    } else {
      throw error;
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Tournaments" }]}
        showDivider={false}
        title="Tournaments"
        subtitle="Track tournament runs, placements, and round-by-round results."
        action={schemaMissing ? undefined : (
          <TournamentEditorDialog
            decks={decks}
            formatOptions={formatOptions}
            triggerLabel="New Tournament"
          />
        )}
      />

      {schemaMissing ? (
        <TournamentSchemaNotice />
      ) : tournaments.length === 0 ? (
        <Card>
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              No tournaments saved yet
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Start with an event you already played or set up an upcoming tournament so you can
              track each round as you go.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {tournaments.map((tournament) => (
            <TournamentCard
              formatLabel={formatLabelMap.get(tournament.format) || tournament.format}
              key={tournament.id}
              tournament={tournament}
            />
          ))}
        </div>
      )}
    </>
  );
}
