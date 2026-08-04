"use client";

import { useEffect, useId, useRef, useState } from "react";
import { updateDeckMatchupPlanAction } from "@/app/(app)/decks/actions";
import { useCoalescedAutosave } from "@/components/hooks/useCoalescedAutosave";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Field, FieldLabel } from "@/components/shadcn/field";
import { Textarea } from "@/components/shadcn/textarea";
import { Card } from "@/components/shadcn/card";
import type { DeckMatchup } from "@/types/index";

type InlineDeckMatchupEditorProps = {
  deckId: string;
  matchup: DeckMatchup;
};

type MatchupState = {
  idealBench: string;
  techsNeeded: string;
  matchupPlan: string;
};

function buildMatchupState(matchup: DeckMatchup): MatchupState {
  return {
    idealBench: matchup.idealBench || "",
    techsNeeded: matchup.techsNeeded || "",
    matchupPlan: matchup.matchupPlan || ""
  };
}

export function InlineDeckMatchupEditor({
  deckId,
  matchup
}: InlineDeckMatchupEditorProps) {
  const idealBenchId = useId();
  const techsNeededId = useId();
  const matchupPlanId = useId();
  const [matchupState, setMatchupState] = useState(() => buildMatchupState(matchup));
  const recordKeyRef = useRef(`${deckId}:${matchup.id}`);
  const {
    errorMessage,
    queueSave: saveMatchup,
    resetSavedValue,
    saveStatus
  } = useCoalescedAutosave({
    fallbackError: "Could not save matchup changes.",
    initialValue: buildMatchupState(matchup),
    async save(nextState) {
      const formData = new FormData();
      formData.set("deckId", deckId);
      formData.set("matchupId", matchup.id);
      formData.set("idealBench", nextState.idealBench);
      formData.set("techsNeeded", nextState.techsNeeded);
      formData.set("matchupPlan", nextState.matchupPlan);

      await updateDeckMatchupPlanAction(formData);
    }
  });

  useEffect(() => {
    const nextRecordKey = `${deckId}:${matchup.id}`;
    if (recordKeyRef.current === nextRecordKey) {
      return;
    }

    recordKeyRef.current = nextRecordKey;
    const nextState = buildMatchupState(matchup);
    setMatchupState(nextState);
    resetSavedValue(nextState);
  }, [deckId, matchup, resetSavedValue]);

  const statusLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed"
          : "";

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ui-eyebrow">Matchup Plan</p>
        {statusLabel ? (
          <p
            aria-atomic={saveStatus === "error" ? undefined : true}
            aria-hidden={saveStatus === "error" ? true : undefined}
            aria-live={saveStatus === "error" ? undefined : "polite"}
            className={`text-sm font-medium ${
              saveStatus === "error"
                ? "text-loss-strong"
                : saveStatus === "saved"
                  ? "text-win-strong"
                  : "text-muted-foreground"
            }`}
            role={saveStatus === "error" ? undefined : "status"}
          >
            {statusLabel}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <Alert variant="loss">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Field>
          <FieldLabel
            className="text-sm font-semibold text-muted-foreground"
            htmlFor={idealBenchId}
          >
            Ideal Bench
          </FieldLabel>
          <Textarea
            className="min-h-[160px] w-full rounded-2xl border border-border bg-muted px-5 py-4 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            id={idealBenchId}
            onBlur={() => saveMatchup(matchupState)}
            onChange={(event) =>
              setMatchupState((current) => ({
                ...current,
                idealBench: event.target.value
              }))
            }
            placeholder="Capture your preferred bench state for this matchup."
            value={matchupState.idealBench}
          />
        </Field>

        <Field>
          <FieldLabel
            className="text-sm font-semibold text-muted-foreground"
            htmlFor={techsNeededId}
          >
            Tech&apos;s needed
          </FieldLabel>
          <Textarea
            className="min-h-[160px] w-full rounded-2xl border border-border bg-muted px-5 py-4 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            id={techsNeededId}
            onBlur={() => saveMatchup(matchupState)}
            onChange={(event) =>
              setMatchupState((current) => ({
                ...current,
                techsNeeded: event.target.value
              }))
            }
            placeholder="List the cards or tech pieces you need for this matchup."
            value={matchupState.techsNeeded}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel
          className="text-sm font-semibold text-muted-foreground"
          htmlFor={matchupPlanId}
        >
          Strategy Notes
        </FieldLabel>
        <Textarea
          className="min-h-[240px] w-full rounded-2xl border border-border bg-muted px-5 py-4 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
          id={matchupPlanId}
          onBlur={() => saveMatchup(matchupState)}
          onChange={(event) =>
            setMatchupState((current) => ({
              ...current,
              matchupPlan: event.target.value
            }))
          }
          placeholder="Capture your matchup plan, sequencing notes, and testing takeaways."
          value={matchupState.matchupPlan}
        />
      </Field>
    </Card>
  );
}
