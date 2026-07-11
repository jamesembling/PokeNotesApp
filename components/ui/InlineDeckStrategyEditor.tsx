"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { updateDeckStrategyAction } from "@/app/(app)/decks/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Field, FieldLabel } from "@/components/shadcn/field";
import { Tabs } from "@/components/shadcn/tabs";
import { Textarea } from "@/components/shadcn/textarea";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { Deck } from "@/types/index";
import type { GoPreference } from "@/types/index";

type InlineDeckStrategy = Pick<
  Deck,
  | "coreStrategy"
  | "generalNotes"
  | "goPreference"
  | "id"
  | "resourcePlan"
  | "setupGoals"
>;

type InlineDeckStrategyEditorProps = {
  deck: InlineDeckStrategy;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type StrategyState = {
  coreStrategy: string;
  generalNotes: string;
  goPreference: GoPreference;
  resourcePlan: string;
  setupGoals: string;
};

function buildStrategyState(deck: InlineDeckStrategy): StrategyState {
  return {
    coreStrategy: deck.coreStrategy || "",
    generalNotes: deck.generalNotes || "",
    goPreference: deck.goPreference || "",
    resourcePlan: deck.resourcePlan || "",
    setupGoals: deck.setupGoals.join("\n")
  };
}

export function InlineDeckStrategyEditor({
  deck
}: InlineDeckStrategyEditorProps) {
  const coreStrategyId = useId();
  const setupGoalsId = useId();
  const resourcePlanId = useId();
  const generalNotesId = useId();
  const [isPending, startTransition] = useTransition();
  const [strategy, setStrategy] = useState(() => buildStrategyState(deck));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const savedStateRef = useRef<StrategyState | null>(null);
  if (savedStateRef.current === null) {
    savedStateRef.current = buildStrategyState(deck);
  }
  const saveStatusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const nextState = buildStrategyState(deck);
    setStrategy(nextState);
    savedStateRef.current = nextState;
    setSaveStatus("idle");
    setErrorMessage("");
  }, [deck]);

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

  function saveStrategy(nextState: StrategyState) {
    if (JSON.stringify(nextState) === JSON.stringify(savedStateRef.current)) {
      return;
    }

    setSaveStatus("saving");
    setErrorMessage("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("deckId", deck.id);
      formData.set("goPreference", nextState.goPreference);
      formData.set("coreStrategy", nextState.coreStrategy);
      formData.set("setupGoals", nextState.setupGoals);
      formData.set("resourcePlan", nextState.resourcePlan);
      formData.set("generalNotes", nextState.generalNotes);

      try {
        await updateDeckStrategyAction(formData);
        savedStateRef.current = nextState;
        setSaveStatus("saved");
        queueSavedReset();
      } catch (error) {
        setSaveStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Could not save strategy changes."
        );
      }
    });
  }

  function updateField<K extends keyof StrategyState>(key: K, value: StrategyState[K]) {
    setStrategy((current) => ({
      ...current,
      [key]: value
    }));
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
    <section className="space-y-5 border-b border-border pb-6">
      <SectionHeader
        actions={statusLabel ? (
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
        eyebrow="Core Strategy"
      />

      {errorMessage ? (
        <Alert variant="loss">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="grid gap-2">
          <p className="text-sm font-semibold text-muted-foreground">Turn Preference</p>
          <Tabs
            onValueChange={(value) => {
              const nextState = {
                ...strategy,
                goPreference: value as GoPreference
              };
              setStrategy(nextState);
              saveStrategy(nextState);
            }}
            value={strategy.goPreference}
          >
            <SegmentedControl
              ariaLabel="Turn preference"
              className="w-fit"
              options={[
                { value: "First", label: "First" },
                { value: "Second", label: "Second" }
              ]}
            />
          </Tabs>
        </section>

        <Field className="md:col-span-2">
          <FieldLabel
            className="text-sm font-semibold text-muted-foreground"
            htmlFor={coreStrategyId}
          >
            Core Strategy
          </FieldLabel>
          <Textarea
            className="min-h-[240px] rounded-xl border border-border bg-card px-4 py-3 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            id={coreStrategyId}
            onBlur={() => saveStrategy(strategy)}
            onChange={(event) => updateField("coreStrategy", event.target.value)}
            placeholder="Outline the main plan, sequencing, and key pressure points."
            value={strategy.coreStrategy}
          />
        </Field>

        <Field>
          <FieldLabel
            className="text-sm font-semibold text-muted-foreground"
            htmlFor={setupGoalsId}
          >
            Ideal Bench
          </FieldLabel>
          <Textarea
            className="min-h-[140px] rounded-xl border border-border bg-card px-4 py-3 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            id={setupGoalsId}
            onBlur={() => saveStrategy(strategy)}
            onChange={(event) => updateField("setupGoals", event.target.value)}
            placeholder="One ideal bench note per line"
            value={strategy.setupGoals}
          />
        </Field>

        <Field>
          <FieldLabel
            className="text-sm font-semibold text-muted-foreground"
            htmlFor={resourcePlanId}
          >
            Potential Cuts / Techs / Inclusions
          </FieldLabel>
          <Textarea
            className="min-h-[140px] rounded-xl border border-border bg-card px-4 py-3 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            id={resourcePlanId}
            onBlur={() => saveStrategy(strategy)}
            onChange={(event) => updateField("resourcePlan", event.target.value)}
            placeholder="Track likely swaps, flex slots, and format calls."
            value={strategy.resourcePlan}
          />
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel
            className="text-sm font-semibold text-muted-foreground"
            htmlFor={generalNotesId}
          >
            General Notes
          </FieldLabel>
          <Textarea
            className="min-h-[140px] rounded-xl border border-border bg-card px-4 py-3 text-sm leading-7 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            id={generalNotesId}
            onBlur={() => saveStrategy(strategy)}
            onChange={(event) => updateField("generalNotes", event.target.value)}
            placeholder="Add matchup trends, testing reminders, and loose notes."
            value={strategy.generalNotes}
          />
        </Field>
      </div>
    </section>
  );
}
