import { Suspense } from "react";
import { Button } from "@/components/ui/Button";
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
import type { TournamentSummary } from "@/types/index";

export default async function TournamentsPage() {
  const user = await requireUser();
  const showSchemaNotice = process.env.NODE_ENV !== "production";
  const tournamentsPromise = getTournamentSummaries(user.id);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Tournaments" }]}
        showDivider={false}
        title="Tournaments"
        action={(
          <Suspense fallback={<TournamentEditorButtonFallback />}>
            <TournamentPageAction
              tournamentsPromise={tournamentsPromise}
              userId={user.id}
            />
          </Suspense>
        )}
      />

      <Suspense fallback={<TournamentsContentFallback />}>
        <TournamentsContent
          showSchemaNotice={showSchemaNotice}
          tournamentsPromise={tournamentsPromise}
        />
      </Suspense>
    </>
  );
}

async function TournamentsContent({
  showSchemaNotice,
  tournamentsPromise
}: {
  showSchemaNotice: boolean;
  tournamentsPromise: Promise<TournamentSummary[]>;
}) {
  let tournaments: TournamentSummary[] = [];

  try {
    tournaments = await tournamentsPromise;
  } catch (error) {
    if (error instanceof TournamentSchemaMissingError) {
      if (showSchemaNotice) {
        return <TournamentSchemaNotice />;
      }

      return (
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
      );
    }

    throw error;
  }

  if (tournaments.length === 0) {
    return (
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
    );
  }

  return <TournamentSummaryList tournaments={tournaments} />;
}

async function TournamentPageAction({
  tournamentsPromise,
  userId
}: {
  tournamentsPromise: Promise<TournamentSummary[]>;
  userId: string;
}) {
  try {
    await tournamentsPromise;
  } catch (error) {
    if (error instanceof TournamentSchemaMissingError) {
      return null;
    }

    throw error;
  }

  return <TournamentCreateAction userId={userId} />;
}

async function TournamentCreateAction({ userId }: { userId: string }) {
  const decks = await getTournamentDeckChoices(userId);

  return <LazyTournamentEditorButton decks={decks} triggerLabel="New Tournament" />;
}

function TournamentEditorButtonFallback() {
  return (
    <Button disabled variant="primary">
      New Tournament
    </Button>
  );
}

function TournamentsContentFallback() {
  return (
    <Card>
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="h-28 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)]"
            key={index}
          />
        ))}
      </div>
    </Card>
  );
}
