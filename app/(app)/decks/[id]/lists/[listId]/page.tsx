import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { DeckListProfile } from "@/components/ui/DeckListProfile";
import styles from "@/components/ui/deck-list/profile.module.css";
import { LazyDeckListEditorButton } from "@/components/ui/LazyDeckListEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import { requireUser } from "@/lib/auth";
import { getDeckWithList } from "@/lib/db/decks";

type DeckListPageProps = {
  params: Promise<{
    id: string;
    listId: string;
  }>;
};

export default async function DeckListPage({ params }: DeckListPageProps) {
  const [user, { id, listId }] = await Promise.all([requireUser(), params]);
  const defaultCreatedBy =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer";
  const result = await getDeckWithList(user.id, id, listId);

  if (!result) {
    return (
      <div className={styles.root}>
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Deck Strategy", href: "/decks" },
            { label: "Not Found" }
          ]}
          title="Deck list not found"
          subtitle="This deck list could not be found or you do not have access to it."
        />

        <div className={styles.notFound}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">
              The requested deck list is unavailable.
            </p>
            <Link
              className="text-sm font-medium text-primary transition hover:text-primary/90"
              href={`/decks/${id}`}
              prefetch={false}
            >
              Back to Deck
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { deckName, deckList } = result;

  return (
    <div className={styles.root}>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Deck Strategy", href: "/decks" },
          { label: deckName, href: `/decks/${id}` },
          { label: deckList.name }
        ]}
        title={deckList.name}
        action={
          <PageActions>
            <LazyDeckListEditorButton
              key={`${deckList.id}:${deckList.updatedAt}`}
              deckId={id}
              deckList={deckList}
              defaultCreatedBy={defaultCreatedBy}
              defaultFormat={deckList.format}
              triggerLabel="Edit List"
              triggerVariant="outline"
            />
            <Button asChild variant="outline">
              <Link href={`/decks/${id}`} prefetch={false}>
                Back to Deck
              </Link>
            </Button>
          </PageActions>
        }
      />

      <DeckListProfile
        deckList={deckList}
        strategyName={deckList.deckId === id ? deckName : undefined}
      />
    </div>
  );
}
