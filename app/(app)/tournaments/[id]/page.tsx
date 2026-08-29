import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeftIcon, EyeIcon, PencilIcon } from "lucide-react";
import { saveTournamentDeckListAction } from "@/app/(app)/tournaments/actions";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { DeckListViewDialog } from "@/components/ui/DeckListViewDialog";
import { LazyDeckListEditorButton } from "@/components/ui/LazyDeckListEditorButton";
import { LazyTournamentEditorButton } from "@/components/ui/LazyTournamentEditorButton";
import { LazyTournamentRoundEditorButton } from "@/components/ui/LazyTournamentRoundEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import { PageWidth } from "@/components/ui/PageWidth";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { TournamentRoundRow } from "@/components/ui/TournamentRoundRow";
import { TournamentSchemaNotice } from "@/components/ui/TournamentSchemaNotice";
import { ItemTitle } from "@/components/ui/Typography";
import { requireUser } from "@/lib/auth";
import { getBattleLogSpriteDisplayName } from "@/lib/battle-log/display";
import { getDeckListById } from "@/lib/db/deck-lists";
import {
  getTournamentById,
  getTournamentRounds,
  TournamentSchemaMissingError
} from "@/lib/db/tournaments";
import { formatTournamentDateRange, getTournamentRecord } from "@/lib/tournaments/display";
import { resolveTournamentDeckListForDisplay } from "@/lib/tournaments/deck-list-workflow";
import { getTournamentCategoryLabel, getTournamentPlacementLabel } from "@/lib/tournaments/options";
import { getTournamentPlacementPillClassName } from "@/lib/tournaments/placement-pill";

type TournamentDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function splitTitleForMobile(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);

  if (words.length < 2) {
    return title;
  }

  const midpoint = Math.ceil(words.length / 2);

  return (
    <>
      <span className="block">{words.slice(0, midpoint).join(" ")}</span>
      <span className="block">{words.slice(midpoint).join(" ")}</span>
    </>
  );
}

function getTournamentDeckDisplayName(sprites: string[]) {
  return getBattleLogSpriteDisplayName(sprites, "/") || "No deck name";
}

function stackDeckName(deckName: string) {
  const parts = deckName.includes("/")
    ? deckName.split("/").map((part) => part.trim()).filter(Boolean)
    : deckName.trim().split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return deckName;
  }

  if (deckName.includes("/")) {
    return (
      <>
        <span className="block">{parts[0]}</span>
        <span className="block">{parts.slice(1).join("/")}</span>
      </>
    );
  }

  const midpoint = Math.ceil(parts.length / 2);
  return (
    <>
      <span className="block">{parts.slice(0, midpoint).join(" ")}</span>
      <span className="block">{parts.slice(midpoint).join(" ")}</span>
    </>
  );
}

export default async function TournamentDetailPage({ params }: TournamentDetailPageProps) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  let tournament = null;
  let rounds = [];

  try {
    [tournament, rounds] = await Promise.all([
      getTournamentById(user.id, id),
      getTournamentRounds(user.id, id)
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

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            The requested tournament is unavailable.
          </p>
          <Link
            className="text-sm font-medium text-primary transition hover:text-primary/90"
            href="/tournaments"
            prefetch={false}
          >
            Back to Tournaments
          </Link>
        </div>
      </PageWidth>
    );
  }

  const record = getTournamentRecord(rounds);
  const tournamentSubheading = [
    formatTournamentDateRange(tournament.dateFrom, tournament.dateTo),
    tournament.category ? getTournamentCategoryLabel(tournament.category) : "",
    tournament.format
  ]
    .filter(Boolean)
    .join(" · ");
  const defaultCreatedBy =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer";
  const tournamentDeckName = getTournamentDeckDisplayName(tournament.deckSprites);
  const resolvedTournamentDeckList = await resolveTournamentDeckListForDisplay({
    loadDeckList: getDeckListById,
    tournament,
    userId: user.id
  });

  return (
    <PageWidth size="standard">
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Tournaments", href: "/tournaments" }
        ]}
        title={tournament.name}
        meta={
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{record}</Badge>
              {tournament.placement ? (
                <Badge className={getTournamentPlacementPillClassName(tournament.placement)}>
                  {getTournamentPlacementLabel(tournament.placement)}
                </Badge>
              ) : null}
            </div>
            {tournamentSubheading ? (
              <p className="max-w-[65ch] text-base leading-7 text-muted-foreground">
                {tournamentSubheading}
              </p>
            ) : null}
          </div>
        }
        mobileTitle={splitTitleForMobile(tournament.name)}
        afterBreadcrumb={
          <Link
            className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary"
            href="/tournaments"
            prefetch={false}
          >
            <ArrowLeftIcon className="size-4" />
            Tournaments
          </Link>
        }
        mobileAction={
          <Suspense fallback={<TournamentEditButtonFallback compact />}>
            <TournamentEditAction compact tournament={tournament} />
          </Suspense>
        }
        action={
          <PageActions className="hidden sm:flex">
            <Suspense fallback={<TournamentEditButtonFallback />}>
              <TournamentEditAction tournament={tournament} />
            </Suspense>
            <Button asChild className="hidden justify-center text-center sm:flex" variant="outline">
              <Link href="/tournaments" prefetch={false}>
                Back to Tournaments
              </Link>
            </Button>
          </PageActions>
        }
      />

      <section className="flex flex-col gap-6 border-b border-border pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <SpriteStrip maxVisible={3} size="xl" sprites={tournament.deckSprites} />
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0">
                <ItemTitle as="p" size="lg">
                  {stackDeckName(tournamentDeckName)}
                </ItemTitle>
              </div>
              <div className="flex shrink-0">
                {resolvedTournamentDeckList ? (
                  <DeckListViewDialog
                    deckListName={resolvedTournamentDeckList?.name ?? "Tournament Deck List"}
                    rawList={resolvedTournamentDeckList?.rawList}
                    sortedCards={resolvedTournamentDeckList?.sortedCards ?? []}
                    triggerChildren={
                      <>
                        <EyeIcon className="size-4" />
                        <span>Deck List</span>
                      </>
                    }
                    triggerClassName="px-3"
                    triggerLabel="Deck List"
                    triggerSize="sm"
                    triggerVariant="outline"
                  />
                ) : (
                  <LazyDeckListEditorButton
                    deckId={tournament.linkedDeckId ?? ""}
                    defaultCreatedBy={defaultCreatedBy}
                    defaultFormat={tournament.format}
                    defaultListName={tournamentDeckName}
                    extraHiddenFields={
                      <input name="tournamentId" type="hidden" value={tournament.id} />
                    }
                    saveAction={saveTournamentDeckListAction}
                    simplePasteMode
                    triggerClassName="px-3"
                    triggerLabel="+ ADD"
                    triggerSize="sm"
                    triggerVariant="outline"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {tournament.notes ? (
          <div className="rounded-2xl border border-border bg-muted p-4">
            <p className="ui-eyebrow">Tournament Notes</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">
              {tournament.notes}
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-5">
        <SectionHeader
          actions={
            <LazyTournamentRoundEditorButton
              tournamentId={tournament.id}
              triggerLabel="Add Round"
              triggerVariant="outline"
            />
          }
          title="Tournament Rounds"
        />

        {rounds.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted p-6">
            <p className="text-sm text-foreground">
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
      </section>
    </PageWidth>
  );
}

async function TournamentEditAction({
  compact = false,
  tournament
}: {
  compact?: boolean;
  tournament: NonNullable<Awaited<ReturnType<typeof getTournamentById>>>;
}) {
  return (
    <LazyTournamentEditorButton
      className="flex-1 justify-center text-center sm:flex-none"
      tournament={tournament}
      triggerChildren={
        compact ? (
          <>
            <PencilIcon className="size-4" />
            <span>Edit</span>
          </>
        ) : undefined
      }
      triggerLabel="Edit Tournament"
      triggerVariant="outline"
    />
  );
}

function TournamentEditButtonFallback({ compact = false }: { compact?: boolean }) {
  return (
    <Button className="flex-1 justify-center text-center sm:flex-none" disabled variant="outline">
      {compact ? (
        <>
          <PencilIcon className="size-4" />
          <span>Edit</span>
        </>
      ) : (
        "Edit Tournament"
      )}
    </Button>
  );
}
