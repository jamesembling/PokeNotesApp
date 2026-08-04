"use client";

import { useEffect, useId, useRef, useState } from "react";
import { updateDeckStrategyAction } from "@/app/(app)/decks/actions";
import { useCoalescedAutosave } from "@/components/hooks/useCoalescedAutosave";
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
  const [strategy, setStrategy] = useState(() => buildStrategyState(deck));
  const strategyRef = useRef(strategy);
  const deckIdRef = useRef(deck.id);
  const {
    errorMessage,
    queueSave: saveStrategy,
    resetSavedValue,
    scheduleSave,
    saveStatus
  } = useCoalescedAutosave({
    fallbackError: "Could not save strategy changes.",
    initialValue: buildStrategyState(deck),
    async save(nextState) {
      const formData = new FormData();
      formData.set("deckId", deck.id);
      formData.set("goPreference", nextState.goPreference);
      formData.set("coreStrategy", nextState.coreStrategy);
      formData.set("setupGoals", nextState.setupGoals);
      formData.set("resourcePlan", nextState.resourcePlan);
      formData.set("generalNotes", nextState.generalNotes);

      await updateDeckStrategyAction(formData);
    }
  });

  useEffect(() => {
    if (deckIdRef.current === deck.id) {
      return;
    }

    deckIdRef.current = deck.id;
    const nextState = buildStrategyState(deck);
    strategyRef.current = nextState;
    setStrategy(nextState);
    resetSavedValue(nextState);
  }, [deck, resetSavedValue]);

  function updateField<K extends keyof StrategyState>(key: K, value: StrategyState[K]) {
    const nextState = {
      ...strategyRef.current,
      [key]: value
    };
    strategyRef.current = nextState;
    setStrategy(nextState);
    scheduleSave(nextState);
  }

  const statusLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed"
          : "";

  return (
    <section
      aria-labelledby="deck-core-strategy-heading"
      className="space-y-5 border-b border-border pb-6"
    >
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
        eyebrowAs="h2"
        eyebrowId="deck-core-strategy-heading"
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
                ...strategyRef.current,
                goPreference: value as GoPreference
              };
              strategyRef.current = nextState;
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
            onBlur={() => saveStrategy(strategyRef.current)}
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
            onBlur={() => saveStrategy(strategyRef.current)}
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
            onBlur={() => saveStrategy(strategyRef.current)}
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
            onBlur={() => saveStrategy(strategyRef.current)}
            onChange={(event) => updateField("generalNotes", event.target.value)}
            placeholder="Add matchup trends, testing reminders, and loose notes."
            value={strategy.generalNotes}
          />
        </Field>
      </div>
    </section>
  );
}
