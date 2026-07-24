"use client";

import { useId, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { addMatchNotesAction } from "@/app/(app)/logs/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Dialog } from "@/components/shadcn/dialog";
import {
  Field,
  FieldDescription,
  FieldLabel
} from "@/components/shadcn/field";
import { Textarea } from "@/components/shadcn/textarea";
import {
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogMobileFooter
} from "@/components/ui/AppDialog";

export type MatchNotesDialogProps = {
  logId: string;
  notes: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

export function MatchNotesDialog({
  logId,
  notes,
  onOpenChange,
  open,
  returnFocusRef
}: MatchNotesDialogProps) {
  const router = useRouter();
  const descriptionId = useId();
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSaveError("");
    setIsSaving(true);

    try {
      await addMatchNotesAction(formData);
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save those match notes.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <AppDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
        showCloseButton={false}
        showMobileCloseButton
        size="compact"
      >
        <AppDialogHeader
          description={
            notes
              ? "Private notes recorded for this battle log."
              : "Add private notes to this battle log."
          }
          descriptionHidden={false}
          title="Match notes"
        />
        {notes ? (
          <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-5">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-card-foreground">
              {notes}
            </p>
          </div>
        ) : (
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit(new FormData(event.currentTarget));
            }}
          >
            <input name="logId" type="hidden" value={logId} />
            <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-5">
              {saveError ? (
                <Alert className="mb-4" variant="loss">
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor={fieldId}>Match notes</FieldLabel>
                <Textarea
                  aria-describedby={descriptionId}
                  autoFocus
                  className="min-h-36 resize-y"
                  id={fieldId}
                  name="matchNotes"
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Record key decisions, turning points, or follow-up ideas"
                  value={draft}
                />
                <FieldDescription id={descriptionId}>
                  Optional and private to you. Match notes are not included in shared links.
                </FieldDescription>
              </Field>
            </div>
            <AppDialogFooter>
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </AppDialogFooter>
            <AppDialogMobileFooter>
              <Button className="min-h-11 w-full" disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </AppDialogMobileFooter>
          </form>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
