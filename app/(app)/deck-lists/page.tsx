import { DeckListCollection } from "@/components/ui/DeckListCollection";
import { LazyDeckListEditorButton } from "@/components/ui/LazyDeckListEditorButton";
import { PageActions } from "@/components/ui/PageActions";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "@/components/ui/deck-list/collection.module.css";
import { requireUser } from "@/lib/auth";
import { getDeckLists, getDeckListUsageCounts } from "@/lib/db/deck-lists";

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
    <div className={styles.page}>
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
            {deckLists.length} {deckLists.length === 1 ? "list" : "lists"}
          </span>
        }
        variant="collection"
        title="Deck Lists"
      />

      <DeckListCollection deckLists={deckLists} usageCounts={usageCounts} />
    </div>
  );
}
