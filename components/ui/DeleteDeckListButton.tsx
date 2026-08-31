"use client";

import { useTransition } from "react";
import { Button } from "@/components/shadcn/button";
import { DeleteConfirmDialog } from "@/components/ui/DeleteConfirmDialog";

type DeleteDeckListButtonProps = {
  action: (formData: FormData) => Promise<never>;
  deckListId: string;
  updatedAt: string;
};

export function DeleteDeckListButton({
  action,
  deckListId,
  updatedAt
}: DeleteDeckListButtonProps) {
  const [isSubmitting, startSubmitting] = useTransition();

  function handleConfirm() {
    const formData = new FormData();
    formData.set("deckListId", deckListId);
    formData.set("updatedAt", updatedAt);
    startSubmitting(() => action(formData));
  }

  return (
    <DeleteConfirmDialog
      confirmLabel={isSubmitting ? "Deleting..." : "Delete List"}
      disabled={isSubmitting}
      message="Deleting this Deck List permanently removes it and clears linked logs, tournaments, and other references."
      onConfirm={handleConfirm}
      title="Delete Deck List?"
      trigger={<Button variant="destructive">Delete List</Button>}
    />
  );
}
