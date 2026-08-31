import Link from "next/link";
import {
  deleteDeckListAction,
  setDeckListAssociationAction
} from "@/app/(app)/deck-lists/actions";
import { Button } from "@/components/shadcn/button";
import { DeleteDeckListButton } from "@/components/ui/DeleteDeckListButton";
import { DeckListProfile } from "@/components/ui/DeckListProfile";
import { ChevronDown } from "lucide-react";
import styles from "@/components/ui/deck-list/profile.module.css";
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
        <div className={styles.notFound}>
          <Button asChild variant="outline">
            <Link href="/deck-lists" prefetch={false}>Back to Deck Lists</Link>
          </Button>
        </div>
      </>
    );
  }

  const isLegacyOnly = deckList.storage === "legacy";
  const strategyName = strategyOptions.find((strategy) => strategy.id === deckList.deckId)?.name;

  return (
    <div className={styles.root}>
      <PageHeader
        action={
          <PageActions>
            <LazyDeckListEditorButton
              key={`${deckList.id}:${deckList.updatedAt}`}
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
      />

      <DeckListProfile
        deckList={deckList}
        strategyName={strategyName}
        associationControl={isLegacyOnly ? (
          <p className={styles.legacyNotice}>
            This list is stored with its Deck Strategy. Save it through Edit List
            to enable moving or deleting it without affecting other strategy content.
          </p>
        ) : (
          <details className={styles.association}>
            <summary className={styles.associationSummary}>
              {deckList.deckId ? "Change association" : "Link a Deck Strategy"}
              <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
            </summary>
            <form action={setDeckListAssociationAction} className={styles.associationForm}>
              <input name="deckListId" type="hidden" value={deckList.id} />
              <input name="updatedAt" type="hidden" value={deckList.updatedAt} />
              <label className={styles.associationLabel} htmlFor="deck-list-strategy">
                Deck Strategy
                <select
                  className={styles.associationSelect}
                  defaultValue={deckList.deckId ?? ""}
                  id="deck-list-strategy"
                  name="deckId"
                >
                  <option value="">Standalone</option>
                  {strategyOptions.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>{strategy.name}</option>
                  ))}
                </select>
              </label>
              <p className={styles.associationHint}>Choose Standalone to keep this list without a linked strategy.</p>
              <Button type="submit" variant="outline">Save association</Button>
            </form>
          </details>
        )}
      />
    </div>
  );
}
