"use client";

import { useState } from "react";
import { Button } from "@/components/shadcn/button";

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
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isConfirming) {
    return (
      <Button
        onClick={() => setIsConfirming(true)}
        type="button"
        variant="destructive"
      >
        Delete List
      </Button>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-loss/40 p-3">
      <p className="max-w-sm text-sm text-muted-foreground" role="alert">
        Deleting this Deck List permanently removes it and clears linked logs,
        tournaments, and other references.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={isSubmitting}
          onClick={() => setIsConfirming(false)}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <form action={action} onSubmit={() => setIsSubmitting(true)}>
          <input name="deckListId" type="hidden" value={deckListId} />
          <input name="updatedAt" type="hidden" value={updatedAt} />
          <Button disabled={isSubmitting} type="submit" variant="destructive">
            {isSubmitting ? "Deleting..." : "Confirm delete"}
          </Button>
        </form>
      </div>
    </div>
  );
}
