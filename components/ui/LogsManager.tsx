"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkAssignDeckListAction,
  deleteLogAction,
  deleteLogsAction
} from "@/app/(app)/logs/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EditLogDialog } from "@/components/ui/EditLogDialog";
import { PencilIcon } from "@/components/ui/icons";
import { LogRow } from "@/components/ui/LogRow";
import type { BattleLog, BattleLogSummary, DeckSummary, PokemonOption } from "@/types/index";

type LogGroup = {
  date: string;
  logs: BattleLogSummary[];
  wins: number;
  losses: number;
};

type LogsManagerProps = {
  hasMore: boolean;
  logs: BattleLogSummary[];
  pokemonOptions: PokemonOption[];
  userDecks: DeckSummary[];
};

function formatGroupDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function groupLogsByDate(logs: BattleLogSummary[]): LogGroup[] {
  const groups = new Map<string, LogGroup>();

  logs.forEach((log) => {
    const existingGroup = groups.get(log.date);

    if (existingGroup) {
      existingGroup.logs.push(log);
      if (log.result === "Win") {
        existingGroup.wins += 1;
      } else {
        existingGroup.losses += 1;
      }

      return;
    }

    groups.set(log.date, {
      date: log.date,
      logs: [log],
      wins: log.result === "Win" ? 1 : 0,
      losses: log.result === "Loss" ? 1 : 0
    });
  });

  return Array.from(groups.values());
}

function toEditableLog(log: BattleLogSummary): BattleLog {
  return {
    id: log.id,
    userId: "",
    date: log.date,
    result: log.result,
    format: log.format,
    goOrder: log.goOrder,
    selfPlayerName: log.selfPlayerName,
    selfDeckName: log.selfDeckName,
    selfDeckSlug: "",
    selfDeckSprites: log.selfDeckSprites,
    opponentPlayerName: log.opponentPlayerName,
    opponentDeckName: log.opponentDeckName,
    opponentDeckSlug: "",
    opponentDeckSprites: log.opponentDeckSprites,
    totalTurns: log.totalTurns,
    coinTossWon: null,
    selfPrizesTaken: 0,
    opponentPrizesTaken: 0,
    selfAttackDamage: 0,
    opponentAttackDamage: 0,
    selfMultigans: 0,
    opponentMulligans: 0,
    linkedDeckId: log.linkedDeckId,
    linkedDeckListId: log.linkedDeckListId,
    reason: "",
    rawLog: "",
    sections: [],
    importedAt: log.importedAt,
    createdAt: log.importedAt,
    updatedAt: log.importedAt
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function LogsManager({ hasMore, logs, pokemonOptions, userDecks }: LogsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isManagementMode, setIsManagementMode] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedDeckListId, setSelectedDeckListId] = useState("");

  const groups = useMemo(() => groupLogsByDate(logs), [logs]);
  const selectedDeck = useMemo(
    () => userDecks.find((deck) => deck.id === selectedDeckId) ?? null,
    [selectedDeckId, userDecks]
  );
  const availableDeckLists = selectedDeck?.deckLists ?? [];
  const allSelected = logs.length > 0 && selectedLogIds.length === logs.length;
  const selectedCount = selectedLogIds.length;
  const canApplyDeckList =
    selectedCount > 0 && Boolean(selectedDeckId) && Boolean(selectedDeckListId) && !isPending;
  const canDeleteSelected = selectedCount > 0 && !isPending;

  useEffect(() => {
    if (!isManagementMode && selectedLogIds.length > 0) {
      setSelectedLogIds([]);
    }
  }, [isManagementMode, selectedLogIds.length]);

  useEffect(() => {
    if (!selectedDeckId) {
      setSelectedDeckListId("");
      return;
    }

    const stillValid = availableDeckLists.some((deckList) => deckList.id === selectedDeckListId);
    if (!stillValid) {
      setSelectedDeckListId("");
    }
  }, [availableDeckLists, selectedDeckId, selectedDeckListId]);

  function toggleSelectedLog(logId: string) {
    setSelectedLogIds((current) =>
      current.includes(logId) ? current.filter((id) => id !== logId) : [...current, logId]
    );
  }

  function toggleSelectAll() {
    setSelectedLogIds(allSelected ? [] : logs.map((log) => log.id));
  }

  function runAsyncAction(work: () => Promise<void>) {
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (error) {
        window.alert(getErrorMessage(error));
      }
    });
  }

  function handleApplyDeckList() {
    runAsyncAction(async () => {
      await bulkAssignDeckListAction({
        logIds: selectedLogIds,
        linkedDeckId: selectedDeckId,
        linkedDeckListId: selectedDeckListId
      });
      setSelectedLogIds([]);
    });
  }

  function handleDeleteSelected() {
    if (!selectedCount) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedCount} battle log${selectedCount === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    runAsyncAction(async () => {
      await deleteLogsAction(selectedLogIds);
      setSelectedLogIds([]);
    });
  }

  function handleDeleteSingle(logId: string) {
    const confirmed = window.confirm("Delete this battle log? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    runAsyncAction(async () => {
      await deleteLogAction(logId);
      setSelectedLogIds((current) => current.filter((id) => id !== logId));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
            All Logs
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            By Date
          </h2>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {isManagementMode ? (
            <>
              <button
                className="text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--color-loss-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canDeleteSelected}
                onClick={handleDeleteSelected}
                type="button"
              >
                Delete Selected{selectedCount ? ` (${selectedCount})` : ""}
              </button>

              {logs.length > 0 ? (
                <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-medium text-[var(--text-muted)]">
                  <input
                    checked={allSelected}
                    className="h-5 w-5 cursor-pointer rounded border-[var(--border)] bg-[var(--bg-surface)]"
                    onChange={toggleSelectAll}
                    type="checkbox"
                  />
                  <span>Select All</span>
                </label>
              ) : null}
            </>
          ) : null}

          {hasMore ? <Badge>More available</Badge> : null}

          <Button
            className="gap-2"
            onClick={() => setIsManagementMode((current) => !current)}
            variant="secondary"
          >
            <PencilIcon className="h-4 w-4" />
            {isManagementMode ? "Done Editing" : "Edit Logs"}
          </Button>
        </div>
      </div>

      {isManagementMode ? (
        <section className="grid gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--bg-surface-alt)] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-start">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Deck Strategy</span>
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
              onChange={(event) => setSelectedDeckId(event.target.value)}
              value={selectedDeckId}
            >
              <option value="">Select deck strategy</option>
              {userDecks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.deckName}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Deck List</span>
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedDeck || availableDeckLists.length === 0}
              onChange={(event) => setSelectedDeckListId(event.target.value)}
              value={selectedDeckListId}
            >
              <option value="">
                {selectedDeck
                  ? availableDeckLists.length > 0
                    ? "Select deck list"
                    : "No saved deck lists yet"
                  : "Choose a deck strategy first"}
              </option>
              {availableDeckLists.map((deckList) => (
                <option key={deckList.id} value={deckList.id}>
                  {deckList.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <Button disabled={!canApplyDeckList} onClick={handleApplyDeckList}>
              {isPending ? "Applying..." : "Apply to Selected"}
            </Button>
          </div>

          <p className="text-sm text-[var(--text-muted)] lg:col-span-3">
            Apply one saved deck list to the {selectedCount} selected battle log
            {selectedCount === 1 ? "" : "s"}.
          </p>
        </section>
      ) : null}

      {groups.length > 0 ? (
        groups.map((group) => (
          <section className="flex flex-col gap-3" key={group.date}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {formatGroupDate(group.date)}
                </h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {group.logs.length} log{group.logs.length === 1 ? "" : "s"}
                </p>
              </div>
              <Badge>
                {group.wins}W-{group.losses}L
              </Badge>
            </div>

            <div className="flex flex-col gap-3">
              {group.logs.map((log) => (
                <LogRow
                  editAction={
                    <EditLogDialog
                      log={toEditableLog(log)}
                      pokemonOptions={pokemonOptions}
                      trigger={
                        <button
                          aria-label="Edit battle log"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]"
                          type="button"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      }
                      userDecks={userDecks}
                    />
                  }
                  key={log.id}
                  log={log}
                  managementMode={isManagementMode}
                  onDelete={() => handleDeleteSingle(log.id)}
                  onToggleSelected={() => toggleSelectedLog(log.id)}
                  selected={selectedLogIds.includes(log.id)}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface-alt)] p-6 text-sm text-[var(--text-muted)]">
          No battle logs yet. Import your first PTCGL log to start tracking results.
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-start">
          <Button disabled variant="secondary">
            More logs coming soon
          </Button>
        </div>
      ) : null}
    </div>
  );
}
