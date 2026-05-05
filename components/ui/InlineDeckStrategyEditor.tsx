"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateDeckStrategyAction } from "@/app/(app)/decks/actions";
import { Textarea } from "@/components/shadcn/textarea";
import { Card } from "@/components/ui/Card";
import type { Deck } from "@/types/index";
import type { GoPreference } from "@/types/index";

type InlineDeckStrategyEditorProps = {
  deck: Deck;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type StrategyState = {
  coreStrategy: string;
  generalNotes: string;
  goPreference: GoPreference;
  resourcePlan: string;
  setupGoals: string;
};

function buildStrategyState(deck: Deck): StrategyState {
  return {
    coreStrategy: deck.coreStrategy || "",
    generalNotes: deck.generalNotes || "",
    goPreference: deck.goPreference || "",
    resourcePlan: deck.resourcePlan || "",
    setupGoals: deck.setupGoals.join("\n")
  };
}

function StrategyPreferenceRadio({
  checked,
  label,
  onClick
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        checked
          ? "border-[var(--color-brand)] bg-[color-mix(in_oklab,var(--color-brand)_10%,var(--bg-surface-alt))] text-[var(--text-primary)]"
          : "border-[var(--border)] bg-[var(--bg-surface-alt)] text-[var(--text-muted)]"
      }`}
      onClick={onClick}
      role="radio"
      type="button"
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
          checked ? "border-[var(--color-brand)]" : "border-[var(--border-strong)]"
        }`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            checked ? "bg-[var(--color-brand)]" : "bg-transparent"
          }`}
        />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export function InlineDeckStrategyEditor({
  deck
}: InlineDeckStrategyEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [strategy, setStrategy] = useState(() => buildStrategyState(deck));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const savedStateRef = useRef<StrategyState>(buildStrategyState(deck));
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
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ui-eyebrow">Core Strategy</p>
        {statusLabel ? (
          <p
            className={`text-sm font-medium ${
              saveStatus === "error"
                ? "text-[var(--color-loss)]"
                : saveStatus === "saved"
                  ? "text-[var(--color-win-strong)]"
                  : "text-[var(--text-muted)]"
            }`}
          >
            {statusLabel}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="rounded-xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="grid gap-2">
          <p className="text-sm font-semibold text-[var(--text-muted)]">Turn Preference</p>
          <div
            aria-label="Turn preference"
            className="grid gap-3 sm:grid-cols-2"
            role="radiogroup"
          >
            <StrategyPreferenceRadio
              checked={strategy.goPreference === "First"}
              label="Prefer First"
              onClick={() => {
                const nextState = {
                  ...strategy,
                  goPreference: "First" as GoPreference
                };
                setStrategy(nextState);
                saveStrategy(nextState);
              }}
            />
            <StrategyPreferenceRadio
              checked={strategy.goPreference === "Second"}
              label="Prefer Second"
              onClick={() => {
                const nextState = {
                  ...strategy,
                  goPreference: "Second" as GoPreference
                };
                setStrategy(nextState);
                saveStrategy(nextState);
              }}
            />
          </div>
        </section>

        <section className="grid gap-2 md:col-span-2">
          <p className="text-sm font-semibold text-[var(--text-muted)]">Core Strategy</p>
          <Textarea
            className="min-h-[240px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm leading-7 text-[var(--text-secondary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            onBlur={() => saveStrategy(strategy)}
            onChange={(event) => updateField("coreStrategy", event.target.value)}
            placeholder="Outline the main plan, sequencing, and key pressure points."
            value={strategy.coreStrategy}
          />
        </section>

        <section className="grid gap-2">
          <p className="text-sm font-semibold text-[var(--text-muted)]">Ideal Bench</p>
          <Textarea
            className="min-h-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm leading-7 text-[var(--text-secondary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            onBlur={() => saveStrategy(strategy)}
            onChange={(event) => updateField("setupGoals", event.target.value)}
            placeholder="One ideal bench note per line"
            value={strategy.setupGoals}
          />
        </section>

        <section className="grid gap-2">
          <p className="text-sm font-semibold text-[var(--text-muted)]">
            Potential Cuts / Techs / Inclusions
          </p>
          <Textarea
            className="min-h-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm leading-7 text-[var(--text-secondary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            onBlur={() => saveStrategy(strategy)}
            onChange={(event) => updateField("resourcePlan", event.target.value)}
            placeholder="Track likely swaps, flex slots, and format calls."
            value={strategy.resourcePlan}
          />
        </section>

        <section className="grid gap-2 md:col-span-2">
          <p className="text-sm font-semibold text-[var(--text-muted)]">General Notes</p>
          <Textarea
            className="min-h-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm leading-7 text-[var(--text-secondary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            onBlur={() => saveStrategy(strategy)}
            onChange={(event) => updateField("generalNotes", event.target.value)}
            placeholder="Add matchup trends, testing reminders, and loose notes."
            value={strategy.generalNotes}
          />
        </section>
      </div>
    </Card>
  );
}
