"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveTournamentDeckListAction } from "@/app/(app)/tournaments/actions";
import { Button } from "@/components/shadcn/button";

export function TournamentDeckListCaptureButton({
  tournamentId,
  sourceDeckId,
  sourceDeckListId
}: {
  tournamentId: string;
  sourceDeckId: string | null;
  sourceDeckListId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creationKey] = useState(() => crypto.randomUUID());

  async function handleCapture() {
    setBusy(true);
    setError("");
    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("sourceDeckId", sourceDeckId ?? "");
    formData.set("sourceDeckListId", sourceDeckListId);
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

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button disabled={busy} onClick={handleCapture} size="sm" type="button" variant="ghost">
        {busy ? "Capturing..." : "Capture current source"}
      </Button>
      {error ? <span className="text-xs text-loss-strong" role="status">{error}</span> : null}
    </span>
  );
}
