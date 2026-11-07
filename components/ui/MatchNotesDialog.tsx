"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { saveMatchNotesAction } from "@/app/(app)/logs/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Dialog } from "@/components/shadcn/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/shadcn/field";
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

// Each opening starts a fresh editor from the saved notes, but the closed
// dialog stays mounted so its exit animation and focus return still run.
export function MatchNotesDialog(props: MatchNotesDialogProps) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setSession((current) => current + 1);
  }
  return <MatchNotesEditor key={`${props.logId}:${session}`} {...props} />;
}

function MatchNotesEditor({
  logId,
  notes,
  onOpenChange,
  open,
  returnFocusRef
}: MatchNotesDialogProps) {
  const router = useRouter();
  const descriptionId = useId();
  const fieldId = useId();
  const [draft, setDraft] = useState(notes ?? "");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleSubmit(formData: FormData) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveError("");
    setIsSaving(true);

    try {
      await saveMatchNotesAction(formData);
      if (mountedRef.current) onOpenChange(false);
      router.refresh();
    } catch (error) {
      if (mountedRef.current) {
        setSaveError(error instanceof Error ? error.message : "Could not save those match notes.");
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!savingRef.current) onOpenChange(nextOpen);
      }}
      open={open}
    >
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
              ? "Edit the private notes recorded for this battle log."
              : "Add private notes to this battle log."
          }
          descriptionHidden={false}
          title="Match notes"
        />
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
                disabled={isSaving}
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
              {isSaving ? "Saving..." : notes ? "Save changes" : "Save"}
            </Button>
          </AppDialogFooter>
          <AppDialogMobileFooter>
            <Button className="min-h-11 w-full" disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : notes ? "Save changes" : "Save"}
            </Button>
          </AppDialogMobileFooter>
        </form>
      </AppDialogContent>
    </Dialog>
  );
}
