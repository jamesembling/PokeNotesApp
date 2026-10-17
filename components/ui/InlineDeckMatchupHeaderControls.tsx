"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { updateDeckMatchupHeaderAction } from "@/app/(app)/decks/actions";
import { useMatchupViewedVersion } from "@/components/hooks/useMatchupViewedVersion";
import { useCoalescedAutosave } from "@/components/hooks/useCoalescedAutosave";
import { AppSelect } from "@/components/shadcn/app-select";
import { Button } from "@/components/shadcn/button";
import { Tabs } from "@/components/shadcn/tabs";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import headerStyles from "@/components/ui/deck-strategy/matchup-header.module.css";
import styles from "@/components/ui/deck-strategy/strategy.module.css";
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
  const viewedVersionRef = useMatchupViewedVersion(matchup.updatedAt);
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
      formData.set("expectedUpdatedAt", viewedVersionRef.current);
      formData.set("matchupId", matchup.id);
      formData.set("format", String(nextState.format || "").trim() || defaultFormat);
      formData.set("goPreference", nextState.goPreference);
      formData.set("matchupFavor", nextState.matchupFavor);

      const result = await updateDeckMatchupHeaderAction(formData);
      viewedVersionRef.current = result.updatedAt;
    }
  });

  useEffect(() => {
    const nextRecordKey = `${deckId}:${matchup.id}`;
    if (recordKeyRef.current === nextRecordKey) {
      return;
    }

    recordKeyRef.current = nextRecordKey;
    viewedVersionRef.current = matchup.updatedAt;
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
    return "Saved";
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
    <div className={headerStyles.controlsShell}>
      <div className={headerStyles.controls}>
        <div className={headerStyles.turnField}>
          <span className={headerStyles.label}>Prefer to Go</span>
          <Tabs
            onValueChange={(value) => {
              const nextState = {
                ...headerState,
                goPreference: value as GoPreference
              };
              setHeaderState(nextState);
              saveHeader(nextState);
            }}
            value={headerState.goPreference}
          >
            <SegmentedControl
              ariaLabel="Turn preference"
              size="sm"
              options={[
                { label: "First", value: "First" },
                { label: "Second", value: "Second" },
                { label: "Not set", value: "" }
              ]}
            />
          </Tabs>
        </div>

        <label className={headerStyles.field} htmlFor="inline-matchup-favor">
          <span className={headerStyles.label}>Matchup favour</span>
          <AppSelect
            aria-label="Matchup favour"
            className={headerStyles.select}
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

        <label className={headerStyles.field} htmlFor="inline-matchup-format">
          <span className={headerStyles.label}>Format</span>
          <AppSelect
            aria-label="Format"
            className={headerStyles.select}
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

        <span
          aria-live="polite"
          className={`${styles.saveStatus} ${headerStyles.status}`}
          data-state={saveStatus}
          role="status"
        >
          {statusLabel}
        </span>
      </div>
      {errorMessage ? (
        <div className={headerStyles.error}>
          <p>{errorMessage}</p>
          <Button onClick={() => saveHeader(headerState)} size="sm" type="button" variant="outline">
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
