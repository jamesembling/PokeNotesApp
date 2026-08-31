import { Suspense } from "react";
import { LazyTournamentEditorButton } from "@/components/ui/LazyTournamentEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import {
  ProxyAuthTimingMarker,
  RouteTimingMarker
} from "@/components/ui/RouteTimingMarker";
import { TournamentSchemaNotice } from "@/components/ui/TournamentSchemaNotice";
import { TournamentSummaryList } from "@/components/ui/TournamentSummaryList";
import { TournamentsContentLoadingState } from "@/components/ui/TournamentsLoadingState";
import { SectionTitle } from "@/components/ui/Typography";
import styles from "@/components/ui/tournament/collection.module.css";
import { requireUser } from "@/lib/auth";
import {
  getTournamentSummaries,
  TournamentSchemaMissingError
} from "@/lib/db/tournaments";
import { measureServerCallWithTiming } from "@/lib/server/perf";
import type { TournamentSummary } from "@/types/index";

export default async function TournamentsPage() {
  const user = await requireUser();
  const showSchemaNotice = process.env.NODE_ENV !== "production";
  const tournamentsPromise = measureServerCallWithTiming("page.tournaments.initialData", () =>
    getTournamentSummaries(user.id)
  );

  return (
    <div className={styles.page}>
      <ProxyAuthTimingMarker />
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Tournaments" }]}
        title="Tournaments"
        action={
          <PageActions className="w-full sm:w-fit" mobile="stack">
            <LazyTournamentEditorButton
              className="w-full justify-center sm:w-auto"
              triggerLabel="+ New Tournament"
              triggerVariant="outline"
            />
          </PageActions>
        }
      />

      <Suspense fallback={<TournamentsContentLoadingState />}>
        <TournamentsContent
          showSchemaNotice={showSchemaNotice}
          tournamentsPromise={tournamentsPromise}
        />
      </Suspense>
    </div>
  );
}

async function TournamentsContent({
  showSchemaNotice,
  tournamentsPromise
}: {
  showSchemaNotice: boolean;
  tournamentsPromise: Promise<{
    durationMs: number;
    value: TournamentSummary[];
  }>;
}) {
  let tournaments: TournamentSummary[] = [];
  let routeDataDurationMs = 0;

  try {
    const tournamentsTiming = await tournamentsPromise;
    tournaments = tournamentsTiming.value;
    routeDataDurationMs = tournamentsTiming.durationMs;
  } catch (error) {
    if (error instanceof TournamentSchemaMissingError) {
      if (showSchemaNotice) {
        return <TournamentSchemaNotice />;
      }

      return (
        <div className={styles.empty}>
          <SectionTitle>
            Tournament tracking is temporarily unavailable
          </SectionTitle>
          <p>
            We could not load tournament data right now. Please try again later or contact the
            app owner if this keeps happening.
          </p>
        </div>
      );
    }

    throw error;
  }

  if (tournaments.length === 0) {
    return (
      <>
        <RouteTimingMarker durationMs={routeDataDurationMs} phase="route-data" />
        <div className={styles.empty}>
          <SectionTitle>
            No tournaments saved yet
          </SectionTitle>
          <p>
            Start with an event you already played or set up an upcoming tournament so you can
            track each round as you go.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <RouteTimingMarker durationMs={routeDataDurationMs} phase="route-data" />
      <TournamentSummaryList tournaments={tournaments} />
    </>
  );
}
