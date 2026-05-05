import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeckListEditorDialog } from "@/components/ui/DeckListEditorDialog";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { requireUser } from "@/lib/auth";
import { getDeckWithList } from "@/lib/db/decks";

type DeckListPageProps = {
  params: Promise<{
    id: string;
    listId: string;
  }>;
};

export default async function DeckListPage({ params }: DeckListPageProps) {
  const user = await requireUser();
  const { id, listId } = await params;
  const defaultCreatedBy =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer";
  const result = await getDeckWithList(user.id, id, listId);

  if (!result) {
    return (
      <PageWidth size="standard">
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Deck Strategy", href: "/decks" },
            { label: "Not Found" }
          ]}
          title="Deck list not found"
          subtitle="This deck list could not be found or you do not have access to it."
        />

        <Card>
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
        </Card>
      </PageWidth>
    );
  }

  const { deckName, deckList } = result;
  const sortedCards = deckList.sortedCards;

  return (
    <PageWidth size="standard">
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Deck Strategy", href: "/decks" },
          { label: deckName, href: `/decks/${id}` },
          { label: deckList.name }
        ]}
        title={deckList.name}
        action={
          <div className="flex flex-wrap gap-3">
            <DeckListEditorDialog
              deckId={id}
              deckList={deckList}
              defaultCreatedBy={defaultCreatedBy}
              defaultFormat={deckList.format}
              triggerLabel="Edit List"
              triggerVariant="secondary"
            />
            <Link href={`/decks/${id}`} prefetch={false}>
              <Button variant="secondary">Back to Deck</Button>
            </Link>
          </div>
        }
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="ui-eyebrow">Deck List</p>
          <CopyDeckListButton text={deckList.rawList} />
        </div>

        {deckList.parsedCards.length === 0 ? (
          <p className="text-sm text-foreground">
            No parsed cards are available for this deck list yet.
          </p>
        ) : (
          <DeckListVisualGrid cards={sortedCards} />
        )}
      </Card>
    </PageWidth>
  );
}
