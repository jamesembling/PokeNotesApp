import Link from "next/link";
import { Card } from "@/components/shadcn/card";
import { ChevronIcon } from "@/components/ui/icons";
import { LazyDeckListEditorButton } from "@/components/ui/LazyDeckListEditorButton";
import { PageActions } from "@/components/ui/PageActions";
import { PageHeader } from "@/components/ui/PageHeader";
import { deckCardRolloverClassName } from "@/components/ui/rolloverStyles";
import { ItemTitle } from "@/components/ui/Typography";
import { requireUser } from "@/lib/auth";
import { formatAppCalendarDate } from "@/lib/date-time";
import { getDeckLists, getDeckListUsageCounts } from "@/lib/db/deck-lists";

function formatUsageCount(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export default async function DeckListsPage() {
  const user = await requireUser();
  const deckLists = await getDeckLists(user.id);
  const usageCounts = await getDeckListUsageCounts(
    user.id,
    deckLists.map((deckList) => deckList.id)
  );
  const defaultCreatedBy =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer";

  return (
    <>
      <PageHeader
        action={
          <PageActions>
            <LazyDeckListEditorButton
              defaultCreatedBy={defaultCreatedBy}
              triggerLabel="+ New Deck List"
              triggerVariant="outline"
            />
          </PageActions>
        }
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Lists" }]}
        meta={
          <span className="text-sm font-medium text-muted-foreground">
            {deckLists.length} lists
          </span>
        }
        title="Deck Lists"
      />

      {deckLists.length === 0 ? (
        <Card>
          <p className="text-sm text-foreground">No Deck Lists saved yet.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="hidden border-b border-border bg-muted px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid md:grid-cols-[minmax(0,1.5fr)_5.5rem_6rem_4.5rem_6rem_7.25rem_1rem] md:items-center md:gap-4 lg:px-5">
            <span>Deck List</span>
            <span className="text-center">Format</span>
            <span className="whitespace-nowrap text-center">Battle Logs</span>
            <span className="text-center">W/L</span>
            <span className="text-center">Tournaments</span>
            <span className="text-right">Updated</span>
            <span aria-hidden="true" />
          </div>
          <div className="divide-y divide-border">
            {deckLists.map((deckList) => {
              const usage = usageCounts.get(deckList.id) ?? {
                battleLogs: 0,
                losses: 0,
                tournaments: 0,
                wins: 0
              };

              return (
                <Link
                  className={`group grid grid-cols-[minmax(0,1fr)_1rem] items-center gap-3 p-4 md:grid-cols-[minmax(0,1.5fr)_5.5rem_6rem_4.5rem_6rem_7.25rem_1rem] md:gap-4 lg:px-5 ${deckCardRolloverClassName}`}
                  href={
                    deckList.deckId
                      ? `/deck-lists/${deckList.id}?deckId=${encodeURIComponent(deckList.deckId)}`
                      : `/deck-lists/${deckList.id}`
                  }
                  key={`${deckList.deckId ?? "standalone"}:${deckList.id}`}
                  prefetch={false}
                >
                  <div className="min-w-0">
                    <ItemTitle as="h2" className="truncate" size="sm">
                      {deckList.name}
                    </ItemTitle>
                    <p className="mt-1 text-sm text-muted-foreground md:hidden">
                      {usage.wins}-{usage.losses} W/L ·{" "}
                      {formatUsageCount(usage.battleLogs, "Battle Log")} ·{" "}
                      {formatUsageCount(usage.tournaments, "Tournament")}
                    </p>
                  </div>
                  <p className="hidden text-center text-sm font-medium text-card-foreground md:block">
                    {deckList.format || "—"}
                  </p>
                  <p className="hidden text-center text-sm font-medium text-card-foreground md:block">
                    {usage.battleLogs}
                  </p>
                  <p className="hidden text-center text-sm font-medium text-card-foreground md:block">
                    {usage.wins}-{usage.losses}
                  </p>
                  <p className="hidden text-center text-sm font-medium text-card-foreground md:block">
                    {usage.tournaments}
                  </p>
                  <p className="hidden text-right text-sm text-muted-foreground md:block">
                    {formatAppCalendarDate(deckList.updatedAt)}
                  </p>
                  <ChevronIcon className="size-4 -rotate-90 justify-self-end text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
