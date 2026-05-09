import { Suspense } from "react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Card } from "@/components/shadcn/card";
import { LazyTournamentEditorButton } from "@/components/ui/LazyTournamentEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { TournamentSchemaNotice } from "@/components/ui/TournamentSchemaNotice";
import { TournamentSummaryList } from "@/components/ui/TournamentSummaryList";
import { requireUser } from "@/lib/auth";
import {
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
        action={<LazyTournamentEditorButton triggerLabel="New Tournament" />}
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
            <h2 className="text-base font-semibold text-card-foreground">
              Tournament tracking is temporarily unavailable
            </h2>
            <p className="text-sm leading-6 text-foreground">
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
          <h2 className="text-base font-semibold text-card-foreground">
            No tournaments saved yet
          </h2>
          <p className="text-sm text-foreground">
            Start with an event you already played or set up an upcoming tournament so you can
            track each round as you go.
          </p>
        </div>
      </Card>
    );
  }

  return <TournamentSummaryList tournaments={tournaments} />;
}

function TournamentsContentFallback() {
  return (
    <Card>
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className="h-28 rounded-2xl border border-border" key={index} />
        ))}
      </div>
    </Card>
  );
}
