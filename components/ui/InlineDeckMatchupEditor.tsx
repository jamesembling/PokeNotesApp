"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { updateDeckMatchupAction } from "@/app/(app)/decks/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Textarea } from "@/components/shadcn/textarea";
import { Card } from "@/components/shadcn/card";
import type { DeckMatchup } from "@/types/index";

type InlineDeckMatchupEditorProps = {
  deckId: string;
  matchup: DeckMatchup;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

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
  const [isPending, startTransition] = useTransition();
  const [matchupState, setMatchupState] = useState(() => buildMatchupState(matchup));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const savedStateRef = useRef<MatchupState | null>(null);
  if (savedStateRef.current === null) {
    savedStateRef.current = buildMatchupState(matchup);
  }
  const saveStatusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const nextState = buildMatchupState(matchup);
    setMatchupState(nextState);
    savedStateRef.current = nextState;
    setSaveStatus("idle");
    setErrorMessage("");
  }, [matchup]);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current !== null) {
        window.clearTimeout(saveStatusTimerRef.current);
      }
    };
  }, []);

  function queueSavedReset() {
    if (saveStatusTimerRef.current !== null) {
      window.clearTimeout(saveStatusTimerRef.current);
    }

    saveStatusTimerRef.current = window.setTimeout(() => {
      setSaveStatus("idle");
    }, 1400);
  }

  function saveMatchup(nextState: MatchupState) {
    if (JSON.stringify(nextState) === JSON.stringify(savedStateRef.current)) {
      return;
    }

    setSaveStatus("saving");
    setErrorMessage("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("deckId", deckId);
      formData.set("matchupId", matchup.id);
      formData.set("deckName", matchup.deckName);
      formData.set("format", matchup.format);
      formData.set("goPreference", matchup.goPreference);
      formData.set("matchupFavor", matchup.matchupFavor);
      formData.set("idealBench", nextState.idealBench);
      formData.set("techsNeeded", nextState.techsNeeded);
      formData.set("matchupPlan", nextState.matchupPlan);
      matchup.deckPokemon.forEach((sprite) => {
        formData.append("matchupSprites", sprite);
      });

      try {
        await updateDeckMatchupAction(formData);
        savedStateRef.current = nextState;
        setMatchupState(savedStateRef.current);
        setSaveStatus("saved");
        queueSavedReset();
      } catch (error) {
        setSaveStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Could not save matchup changes."
        );
      }
    });
  }

  const statusLabel =
    saveStatus === "saving" || isPending
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
            className={`text-sm font-medium ${
              saveStatus === "error"
                ? "text-loss"
                : saveStatus === "saved"
                  ? "text-win"
                  : "text-muted-foreground"
            }`}
          >
            {statusLabel}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <Alert
          className="border-loss-border bg-loss-bg text-loss"
          variant="destructive"
        >
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Ideal Bench</p>
          <Textarea
            className="min-h-[160px] w-full rounded-2xl border border-border bg-muted px-5 py-4 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
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
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Tech&apos;s needed</p>
          <Textarea
            className="min-h-[160px] w-full rounded-2xl border border-border bg-muted px-5 py-4 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
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
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Strategy Notes</p>
        <Textarea
          className="min-h-[240px] w-full rounded-2xl border border-border bg-muted px-5 py-4 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
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
      </div>
    </Card>
  );
}
