import Link from "next/link";
import {
  deleteDeckListAction,
  setDeckListAssociationAction
} from "@/app/(app)/deck-lists/actions";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeleteDeckListButton } from "@/components/ui/DeleteDeckListButton";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { LazyDeckListEditorButton } from "@/components/ui/LazyDeckListEditorButton";
import { PageActions } from "@/components/ui/PageActions";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import {
  getDeckListById,
  getOwnedDeckStrategyOptions
} from "@/lib/db/deck-lists";

type DeckListPageProps = {
  params: Promise<{ listId: string }>;
  searchParams?: Promise<{ deckId?: string }>;
};

export default async function FirstClassDeckListPage({ params, searchParams }: DeckListPageProps) {
  const [user, { listId }, query] = await Promise.all([
    requireUser(),
    params,
    searchParams ?? Promise.resolve({ deckId: undefined })
  ]);
  const deckId = String(query.deckId || "").trim() || null;
  const [deckList, strategyOptions] = await Promise.all([
    getDeckListById(user.id, listId, deckId),
    getOwnedDeckStrategyOptions(user.id)
  ]);
  const defaultCreatedBy =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer";

  if (!deckList) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Lists", href: "/deck-lists" }, { label: "Not Found" }]}
          title="Deck List not found"
          subtitle="This Deck List could not be found or you do not have access to it."
        />
        <Card>
          <Button asChild variant="outline">
            <Link href="/deck-lists" prefetch={false}>Back to Deck Lists</Link>
          </Button>
        </Card>
      </>
    );
  }

  const isLegacyOnly = deckList.storage === "legacy";

  return (
    <>
      <PageHeader
        action={
          <PageActions>
            <LazyDeckListEditorButton
              deckId={deckList.deckId ?? undefined}
              deckList={deckList}
              defaultCreatedBy={defaultCreatedBy}
              defaultFormat={deckList.format}
              triggerLabel="Edit List"
              triggerVariant="outline"
            />
            {!isLegacyOnly ? (
              <DeleteDeckListButton
                action={deleteDeckListAction}
                deckListId={deckList.id}
                updatedAt={deckList.updatedAt}
              />
            ) : null}
          </PageActions>
        }
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Lists", href: "/deck-lists" }, { label: deckList.name }]}
        title={deckList.name}
        subtitle={deckList.deckId ? "Associated with a Deck Strategy" : "Standalone Deck List"}
      />

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {deckList.format}{deckList.date ? ` · ${deckList.date}` : ""}
          </div>
          <CopyDeckListButton text={deckList.rawList} />
        </div>
        {deckList.sortedCards.length > 0 ? (
          <DeckListVisualGrid cards={deckList.sortedCards} />
        ) : (
          <p className="text-sm text-foreground">No parsed cards are available for this Deck List yet.</p>
        )}
      </Card>

      {isLegacyOnly ? (
        <Card className="space-y-2">
          <h2 className="font-semibold">Legacy compatibility list</h2>
          <p className="text-sm text-muted-foreground">
            Edit this strategy-scoped list to exact-adopt it as a first-class Deck List.
            Delete and association controls are unavailable until that adoption completes.
          </p>
        </Card>
      ) : (
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Deck Strategy association</h2>
            <p className="text-sm text-muted-foreground">
              Attach this account-owned list to a strategy, or choose Standalone to detach it.
            </p>
          </div>
          <form action={setDeckListAssociationAction} className="flex flex-wrap items-end gap-3">
            <input name="deckListId" type="hidden" value={deckList.id} />
            <input name="updatedAt" type="hidden" value={deckList.updatedAt} />
            <label className="grid min-w-64 gap-1 text-sm" htmlFor="deck-list-strategy">
              Strategy
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={deckList.deckId ?? ""}
                id="deck-list-strategy"
                name="deckId"
              >
                <option value="">Standalone</option>
                {strategyOptions.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Save association</Button>
          </form>
        </Card>
      )}
    </>
  );
}
