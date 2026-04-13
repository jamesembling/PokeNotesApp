import { Card } from "@/components/ui/Card";
import { LazyTournamentEditorButton } from "@/components/ui/LazyTournamentEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { TournamentSchemaNotice } from "@/components/ui/TournamentSchemaNotice";
import { TournamentSummaryList } from "@/components/ui/TournamentSummaryList";
import { requireUser } from "@/lib/auth";
import {
  getTournamentDeckChoices,
  getTournamentSummaries,
  TournamentSchemaMissingError
} from "@/lib/db/tournaments";
import type { DeckSummary, TournamentSummary } from "@/types/index";

export default async function TournamentsPage() {
  const user = await requireUser();
  const showSchemaNotice = process.env.NODE_ENV !== "production";
  let tournaments: TournamentSummary[] = [];
  let decks: DeckSummary[] = [];
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
          <LazyTournamentEditorButton
            decks={decks}
            triggerLabel="New Tournament"
          />
        )}
      />

      {schemaMissing && showSchemaNotice ? (
        <TournamentSchemaNotice />
      ) : schemaMissing ? (
        <Card>
          <div className="flex flex-col gap-3">
            <p className="ui-eyebrow">Tournaments Unavailable</p>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Tournament tracking is temporarily unavailable
            </h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              We could not load tournament data right now. Please try again later or contact the
              app owner if this keeps happening.
            </p>
          </div>
        </Card>
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
        <TournamentSummaryList tournaments={tournaments} />
      )}
    </>
  );
}
