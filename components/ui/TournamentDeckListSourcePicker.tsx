"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveTournamentDeckListAction } from "@/app/(app)/tournaments/actions";
import { Button } from "@/components/shadcn/button";

type SourceOption = {
  id: string;
  name: string;
  deckId: string | null;
  updatedAt: string;
};

export function TournamentDeckListSourcePicker({
  tournamentId,
  expectedUpdatedAt,
  options,
  replace = false
}: {
  tournamentId: string;
  expectedUpdatedAt: string;
  options: SourceOption[];
  replace?: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const [creationKey, setCreationKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = options.find((option) => option.id === selectedId);

  async function handleCapture() {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError("");
    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("sourceDeckId", selected.deckId ?? "");
    formData.set("sourceDeckListId", selected.id);
    formData.set("associateStrategy", "false");
    formData.set("replaceDeckList", String(replace));
    formData.set("creationKey", creationKey);
    formData.set("redirectTo", window.location.pathname);
    const result = await saveTournamentDeckListAction(formData);
    setBusy(false);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  if (options.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`tournament-source-list-${tournamentId}`}>
        Existing Deck List
      </label>
      <select
        className="min-h-9 max-w-48 rounded-md border border-border bg-background px-2 text-xs"
        id={`tournament-source-list-${tournamentId}`}
        onChange={(event) => {
          setSelectedId(event.target.value);
          setCreationKey(crypto.randomUUID());
          setError("");
        }}
        value={selectedId}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
      <Button disabled={busy || !selected} onClick={handleCapture} size="sm" type="button" variant="outline">
        {busy ? "Capturing..." : replace ? "Replace with existing" : "Capture existing"}
      </Button>
      {error ? <span className="basis-full text-xs text-loss-strong" role="status">{error}</span> : null}
    </span>
  );
}
