"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeTournamentDeckListAction } from "@/app/(app)/tournaments/actions";
import { Button } from "@/components/shadcn/button";

export function TournamentDeckListRemoveButton({
  tournamentId,
  expectedUpdatedAt
}: {
  tournamentId: string;
  expectedUpdatedAt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creationKey] = useState(() => crypto.randomUUID());

  async function handleRemove() {
    if (!window.confirm("Remove the Tournament Deck List? The saved Deck List will remain available.")) {
      return;
    }
    setBusy(true);
    setError("");
    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("expectedUpdatedAt", expectedUpdatedAt);
    formData.set("creationKey", creationKey);
    formData.set("redirectTo", window.location.pathname);
    const result = await removeTournamentDeckListAction(formData);
    setBusy(false);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button disabled={busy} onClick={handleRemove} size="sm" type="button" variant="ghost">
        {busy ? "Removing..." : "Remove"}
      </Button>
      {error ? <span className="max-w-48 text-right text-xs text-loss-strong" role="status">{error}</span> : null}
    </span>
  );
}
