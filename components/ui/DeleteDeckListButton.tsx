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
      message="Delete this Deck List and remove its links from Battle Logs and Tournaments? The Battle Logs and Tournaments themselves are kept."
      onConfirm={handleConfirm}
      title="Delete Deck List?"
      trigger={
        <Button
          className="border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-loss-strong hover:bg-[var(--color-loss-bg)]"
          variant="destructive"
        >
          Delete List
        </Button>
      }
    />
  );
}
