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
  const [creationKey] = useState(() => crypto.randomUUID());

  async function handleRemove() {
    if (!window.confirm("Remove the Tournament Deck List? The saved Deck List will remain available.")) {
      return;
    }
    setBusy(true);
    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("expectedUpdatedAt", expectedUpdatedAt);
    formData.set("creationKey", creationKey);
    formData.set("redirectTo", window.location.pathname);
    const result = await removeTournamentDeckListAction(formData);
    setBusy(false);
    if (result.ok) {
      router.refresh();
    }
  }

  return (
    <Button disabled={busy} onClick={handleRemove} size="sm" type="button" variant="ghost">
      {busy ? "Removing..." : "Remove"}
    </Button>
  );
}
