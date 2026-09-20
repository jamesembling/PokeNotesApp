"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDeckStrategyFromTournamentListAction } from "@/app/(app)/tournaments/actions";
import { Button } from "@/components/shadcn/button";

export function CreateDeckStrategyFromListButton({
  deckListId,
  deckListUpdatedAt,
  deckName,
  deckPokemon,
  format,
  tournamentId,
  tournamentUpdatedAt
}: {
  deckListId: string;
  deckListUpdatedAt: string;
  deckName: string;
  deckPokemon: string[];
  format: string;
  tournamentId: string;
  tournamentUpdatedAt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creationKey] = useState(() => crypto.randomUUID());

  async function handleCreate() {
    setBusy(true);
    setError("");
    const formData = new FormData();
    formData.set("deckListId", deckListId);
    formData.set("expectedDeckListUpdatedAt", deckListUpdatedAt);
    formData.set("deckName", deckName);
    formData.set("format", format);
    formData.set("tournamentId", tournamentId);
    formData.set("expectedTournamentUpdatedAt", tournamentUpdatedAt);
    formData.set("creationKey", creationKey);
    formData.set("redirectTo", window.location.pathname);
    deckPokemon.forEach((sprite) => formData.append("deckPokemon", sprite));
    const result = await createDeckStrategyFromTournamentListAction(formData);
    setBusy(false);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button disabled={busy} onClick={handleCreate} size="sm" type="button" variant="outline">
        {busy ? "Creating Strategy..." : "Create Strategy from this list"}
      </Button>
      {error ? <span className="max-w-56 text-right text-xs text-loss-strong" role="status">{error}</span> : null}
    </span>
  );
}
