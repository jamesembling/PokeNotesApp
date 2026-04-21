"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDeckMatchupAction,
  updateDeckMatchupAction
} from "@/app/(app)/decks/actions";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import type { DeckMatchup, GoPreference, MatchupFavorability } from "@/types/index";

type InlineDeckMatchupHeaderControlsProps = {
  deckId: string;
  matchup: DeckMatchup;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type HeaderState = {
  format: string;
  goPreference: GoPreference;
  matchupFavor: MatchupFavorability;
};

const MATCHUP_FAVOR_OPTIONS: MatchupFavorability[] = [
  "Heavily Favoured",
  "Slightly Favoured",
  "Even",
  "Slightly Unfavoured",
  "Heavily Unfavoured"
];

function buildHeaderState(matchup: DeckMatchup): HeaderState {
  return {
    format: matchup.format || "",
    goPreference: matchup.goPreference || "",
    matchupFavor: matchup.matchupFavor || ""
  };
}

export function InlineDeckMatchupHeaderControls({
  deckId,
  matchup
}: InlineDeckMatchupHeaderControlsProps) {
  const router = useRouter();
  const isPlaceholderMatchup = matchup.id.startsWith("placeholder-");
  const [isPending, startTransition] = useTransition();
  const { defaultFormat, options: siteFormatOptions } = useSiteFormats();
  const [headerState, setHeaderState] = useState<HeaderState>(() => buildHeaderState(matchup));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const savedStateRef = useRef<HeaderState>(buildHeaderState(matchup));
  const saveStatusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const nextState = buildHeaderState(matchup);
    setHeaderState(nextState);
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

  const statusLabel = useMemo(() => {
    if (saveStatus === "saving" || isPending) {
      return "Saving...";
    }
    if (saveStatus === "saved") {
      return "Saved";
    }
    if (saveStatus === "error") {
      return "Save failed";
    }
      return "";
  }, [isPending, saveStatus]);

  const formatOptions = useMemo(() => {
    const normalizedFormat = String(headerState.format || "").trim();
    if (!normalizedFormat) {
      return [...siteFormatOptions];
    }

    return siteFormatOptions.includes(normalizedFormat)
      ? [...siteFormatOptions]
      : [normalizedFormat, ...siteFormatOptions];
  }, [headerState.format, siteFormatOptions]);

  function queueSavedReset() {
    if (saveStatusTimerRef.current !== null) {
      window.clearTimeout(saveStatusTimerRef.current);
    }

    saveStatusTimerRef.current = window.setTimeout(() => {
      setSaveStatus("idle");
    }, 1400);
  }

  function saveHeader(nextState: HeaderState) {
    if (JSON.stringify(nextState) === JSON.stringify(savedStateRef.current)) {
      return;
    }

    setSaveStatus("saving");
    setErrorMessage("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("deckId", deckId);
      formData.set("deckName", matchup.deckName);
      formData.set("format", String(nextState.format || "").trim() || defaultFormat);
      formData.set("goPreference", nextState.goPreference);
      formData.set("matchupFavor", nextState.matchupFavor);
      formData.set("idealBench", matchup.idealBench);
      formData.set("techsNeeded", matchup.techsNeeded);
      formData.set("matchupPlan", matchup.matchupPlan);
      matchup.deckPokemon.forEach((sprite) => {
        formData.append("matchupSprites", sprite);
      });

      try {
        if (isPlaceholderMatchup) {
          const result = await createDeckMatchupAction(formData);
          savedStateRef.current = {
            ...nextState,
            format: String(nextState.format || "").trim() || defaultFormat
          };
          setHeaderState(savedStateRef.current);
          setSaveStatus("saved");
          router.push(result.redirectTo);
          return;
        }

        formData.set("matchupId", matchup.id);
        await updateDeckMatchupAction(formData);
        savedStateRef.current = {
          ...nextState,
          format: String(nextState.format || "").trim() || defaultFormat
        };
        setHeaderState(savedStateRef.current);
        setSaveStatus("saved");
        router.refresh();
        queueSavedReset();
      } catch (error) {
        setSaveStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Could not save matchup preference."
        );
      }
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Matchup Favour
        </span>
        <select
          className="min-h-[48px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
          onBlur={() => saveHeader(headerState)}
          onChange={(event) =>
            setHeaderState((current) => ({
              ...current,
              matchupFavor: event.target.value as MatchupFavorability
            }))
          }
          value={headerState.matchupFavor}
        >
          <option value="">Select favour</option>
          {MATCHUP_FAVOR_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Turn Preference
        </span>
        <select
          className="min-h-[48px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
          onBlur={() => saveHeader(headerState)}
          onChange={(event) => {
            const nextState = {
              ...headerState,
              goPreference: event.target.value as GoPreference
            };
            setHeaderState(nextState);
            saveHeader(nextState);
          }}
          value={headerState.goPreference}
        >
          <option value="">Select order</option>
          <option value="First">Go First</option>
          <option value="Second">Go Second</option>
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Format
        </span>
        <select
          className="min-h-[48px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
          onBlur={() => saveHeader(headerState)}
          onChange={(event) =>
            setHeaderState((current) => ({
              ...current,
              format: event.target.value
            }))
          }
          value={headerState.format || defaultFormat}
        >
          {formatOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      {statusLabel ? (
        <p
          className={`text-xs font-medium sm:col-span-3 ${
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
      {errorMessage ? (
        <p className="text-xs text-[var(--color-loss)] sm:col-span-3">{errorMessage}</p>
      ) : null}
    </div>
  );
}
