import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { Card, CardTitle } from "@/components/shadcn/card";
import { LazyDeckListEditorButton } from "@/components/ui/LazyDeckListEditorButton";
import { PageActions } from "@/components/ui/PageActions";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getDeckLists } from "@/lib/db/deck-lists";

export default async function DeckListsPage() {
  const user = await requireUser();
  const deckLists = await getDeckLists(user.id);
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
        subtitle="Account-owned lists can stand alone or be associated with a Deck Strategy."
        title="Deck Lists"
      />

      {deckLists.length === 0 ? (
        <Card>
          <p className="text-sm text-foreground">No Deck Lists saved yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {deckLists.map((deckList) => (
            <Card
              className="flex flex-col gap-4"
              key={`${deckList.deckId ?? "standalone"}:${deckList.id}`}
            >
              <div className="min-w-0">
                <CardTitle as="h2" className="truncate">
                  {deckList.name}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {deckList.deckId ? "Associated with a Deck Strategy" : "Standalone Deck List"}
                </p>
              </div>
              <Button asChild className="w-full" variant="outline">
                <Link
                  href={
                    deckList.deckId
                      ? `/deck-lists/${deckList.id}?deckId=${encodeURIComponent(deckList.deckId)}`
                      : `/deck-lists/${deckList.id}`
                  }
                  prefetch={false}
                >
                  View Deck List
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
