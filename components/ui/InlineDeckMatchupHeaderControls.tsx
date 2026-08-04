"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { updateDeckMatchupHeaderAction } from "@/app/(app)/decks/actions";
import { useCoalescedAutosave } from "@/components/hooks/useCoalescedAutosave";
import { AppSelect } from "@/components/shadcn/app-select";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import type { DeckMatchup, GoPreference, MatchupFavorability } from "@/types/index";

type InlineDeckMatchupHeaderControlsProps = {
  deckId: string;
  matchup: DeckMatchup;
};

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
  const { defaultFormat, options: siteFormatOptions } = useSiteFormats();
  const [headerState, setHeaderState] = useState<HeaderState>(() => buildHeaderState(matchup));
  const recordKeyRef = useRef(`${deckId}:${matchup.id}`);
  const {
    errorMessage,
    queueSave: saveHeader,
    resetSavedValue,
    saveStatus
  } = useCoalescedAutosave({
    fallbackError: "Could not save matchup preference.",
    initialValue: buildHeaderState(matchup),
    async save(nextState) {
      const formData = new FormData();
      formData.set("deckId", deckId);
      formData.set("matchupId", matchup.id);
      formData.set("format", String(nextState.format || "").trim() || defaultFormat);
      formData.set("goPreference", nextState.goPreference);
      formData.set("matchupFavor", nextState.matchupFavor);

      await updateDeckMatchupHeaderAction(formData);
    }
  });

  useEffect(() => {
    const nextRecordKey = `${deckId}:${matchup.id}`;
    if (recordKeyRef.current === nextRecordKey) {
      return;
    }

    recordKeyRef.current = nextRecordKey;
    const nextState = buildHeaderState(matchup);
    setHeaderState(nextState);
    resetSavedValue(nextState);
  }, [deckId, matchup, resetSavedValue]);

  const statusLabel = useMemo(() => {
    if (saveStatus === "saving") {
      return "Saving...";
    }
    if (saveStatus === "saved") {
      return "Saved";
    }
    if (saveStatus === "error") {
      return "Save failed";
    }
      return "";
  }, [saveStatus]);

  const formatOptions = useMemo(() => {
    const normalizedFormat = String(headerState.format || "").trim();
    if (!normalizedFormat) {
      return [...siteFormatOptions];
    }

    return siteFormatOptions.includes(normalizedFormat)
      ? [...siteFormatOptions]
      : [normalizedFormat, ...siteFormatOptions];
  }, [headerState.format, siteFormatOptions]);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1.5" htmlFor="inline-matchup-favor">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Matchup Favour
        </span>
        <AppSelect
          aria-label="Matchup favour"
          className="min-h-[48px] rounded-xl px-4 py-3"
          id="inline-matchup-favor"
          onChange={(value) => {
            const nextState = {
              ...headerState,
              matchupFavor: value as MatchupFavorability
            };
            setHeaderState(nextState);
            saveHeader(nextState);
          }}
          options={[
            { label: "Select favour", value: "" },
            ...MATCHUP_FAVOR_OPTIONS.map((option) => ({
              label: option,
              value: option
            }))
          ]}
          placeholder="Select favour"
          value={headerState.matchupFavor}
        />
      </label>

      <label className="grid gap-1.5" htmlFor="inline-matchup-go-preference">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Turn Preference
        </span>
        <AppSelect
          aria-label="Turn preference"
          className="min-h-[48px] rounded-xl px-4 py-3"
          id="inline-matchup-go-preference"
          onChange={(value) => {
            const nextState = {
              ...headerState,
              goPreference: value as GoPreference
            };
            setHeaderState(nextState);
            saveHeader(nextState);
          }}
          options={[
            { label: "Select order", value: "" },
            { label: "Go First", value: "First" },
            { label: "Go Second", value: "Second" }
          ]}
          placeholder="Select order"
          value={headerState.goPreference}
        />
      </label>

      <label className="grid gap-1.5" htmlFor="inline-matchup-format">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Format
        </span>
        <AppSelect
          aria-label="Format"
          className="min-h-[48px] rounded-xl px-4 py-3"
          id="inline-matchup-format"
          onChange={(value) => {
            const nextState = {
              ...headerState,
              format: value
            };
            setHeaderState(nextState);
            saveHeader(nextState);
          }}
          options={formatOptions.map((option) => ({
            label: option,
            value: option
          }))}
          value={headerState.format || defaultFormat}
        />
      </label>

      {statusLabel ? (
        <p
          className={`text-xs font-medium sm:col-span-3 ${
            saveStatus === "error"
              ? "text-loss-strong"
              : saveStatus === "saved"
                ? "text-win-strong"
                : "text-muted-foreground"
          }`}
        >
          {statusLabel}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="text-xs text-loss-strong sm:col-span-3">{errorMessage}</p>
      ) : null}
    </div>
  );
}
