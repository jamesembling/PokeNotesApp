"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkAssignDeckListAction,
  deleteLogAction,
  deleteLogsAction,
  loadMoreLogsAction
} from "@/app/(app)/logs/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EditLogDialog } from "@/components/ui/EditLogDialog";
import { ChevronIcon, PencilIcon } from "@/components/ui/icons";
import { LogRow } from "@/components/ui/LogRow";
import type { BattleLog, BattleLogSummary, DeckSummary, PokemonOption } from "@/types/index";

type LogGroup = {
  date: string;
  logs: BattleLogSummary[];
  wins: number;
  losses: number;
};

type LogsManagerProps = {
  initialCanLoadMore: boolean;
  initialLogs: BattleLogSummary[];
  initialNextWindowEndDate: string;
  initialWindowEndDate: string;
  initialWindowStartDate: string;
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

function formatRangeDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function mergeLogs(current: BattleLogSummary[], incoming: BattleLogSummary[]) {
  const merged = new Map<string, BattleLogSummary>();

  current.forEach((log) => {
    merged.set(log.id, log);
  });

  incoming.forEach((log) => {
    merged.set(log.id, log);
  });

  return Array.from(merged.values()).sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }

    return right.importedAt.localeCompare(left.importedAt);
  });
}

function attachLinkedDeckListNames(logs: BattleLogSummary[], userDecks: DeckSummary[]) {
  return logs.map((log) => {
    if (!log.linkedDeckId || !log.linkedDeckListId) {
      return {
        ...log,
        linkedDeckListName: undefined
      };
    }

    const deck = userDecks.find((candidate) => candidate.id === log.linkedDeckId);
    const linkedDeckList = deck?.deckLists.find((deckList) => deckList.id === log.linkedDeckListId);

    return {
      ...log,
      linkedDeckListName: linkedDeckList?.name
    };
  });
}

export function LogsManager({
  initialCanLoadMore,
  initialLogs,
  initialNextWindowEndDate,
  initialWindowEndDate,
  initialWindowStartDate,
  pokemonOptions,
  userDecks
}: LogsManagerProps) {
  const router = useRouter();
  const [isMutating, startMutationTransition] = useTransition();
  const [isLoadingMore, startLoadMoreTransition] = useTransition();
  const [isManagementMode, setIsManagementMode] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedDeckListId, setSelectedDeckListId] = useState("");
  const [visibleLogs, setVisibleLogs] = useState(initialLogs);
  const [canLoadMore, setCanLoadMore] = useState(initialCanLoadMore);
  const [nextWindowEndDate, setNextWindowEndDate] = useState(initialNextWindowEndDate);
  const [windowStartDate, setWindowStartDate] = useState(initialWindowStartDate);
  const [windowEndDate, setWindowEndDate] = useState(initialWindowEndDate);
  const [loadMoreError, setLoadMoreError] = useState("");

  const groups = useMemo(() => groupLogsByDate(visibleLogs), [visibleLogs]);
  const selectedDeck = useMemo(
    () => userDecks.find((deck) => deck.id === selectedDeckId) ?? null,
    [selectedDeckId, userDecks]
  );
  const availableDeckLists = selectedDeck?.deckLists ?? [];
  const allSelected = visibleLogs.length > 0 && selectedLogIds.length === visibleLogs.length;
  const selectedCount = selectedLogIds.length;
  const canApplyDeckList =
    selectedCount > 0 && Boolean(selectedDeckId) && Boolean(selectedDeckListId) && !isMutating;
  const canDeleteSelected = selectedCount > 0 && !isMutating;
  const currentWindowSummary =
    windowStartDate && windowEndDate
      ? `${formatRangeDate(windowStartDate)} - ${formatRangeDate(windowEndDate)}`
      : "";
  const totalWins = visibleLogs.reduce((sum, log) => sum + (log.result === "Win" ? 1 : 0), 0);
  const totalLosses = visibleLogs.reduce((sum, log) => sum + (log.result === "Loss" ? 1 : 0), 0);

  useEffect(() => {
    setVisibleLogs(initialLogs);
    setCanLoadMore(initialCanLoadMore);
    setNextWindowEndDate(initialNextWindowEndDate);
    setWindowStartDate(initialWindowStartDate);
    setWindowEndDate(initialWindowEndDate);
    setLoadMoreError("");
  }, [
    initialCanLoadMore,
    initialLogs,
    initialNextWindowEndDate,
    initialWindowEndDate,
    initialWindowStartDate
  ]);

  useEffect(() => {
    if (!isManagementMode && selectedLogIds.length > 0) {
      setSelectedLogIds([]);
    }
  }, [isManagementMode, selectedLogIds.length]);

  useEffect(() => {
    const validIds = new Set(visibleLogs.map((log) => log.id));
    setSelectedLogIds((current) => current.filter((id) => validIds.has(id)));
  }, [visibleLogs]);

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
    setSelectedLogIds(allSelected ? [] : visibleLogs.map((log) => log.id));
  }

  function runAsyncAction(work: () => Promise<void>) {
    startMutationTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (error) {
        window.alert(getErrorMessage(error));
      }
    });
  }

  function handleLoadMore() {
    if (isLoadingMore || !canLoadMore) {
      return;
    }

    startLoadMoreTransition(async () => {
      try {
        setLoadMoreError("");
        const result = await loadMoreLogsAction(nextWindowEndDate);
        const nextLogs = attachLinkedDeckListNames(result.logs, userDecks);

        setVisibleLogs((current) => mergeLogs(current, nextLogs));
        setCanLoadMore(result.hasMore);
        setNextWindowEndDate(result.nextWindowEndDate);
        setWindowStartDate(result.windowStartDate);
        setWindowEndDate((current) => current || result.windowEndDate);
      } catch (error) {
        setLoadMoreError(getErrorMessage(error));
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
      <section className="grid gap-4 rounded-[26px] border border-[var(--border)] bg-[var(--bg-surface-alt)] p-4 sm:p-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)] xl:items-start">
        <div className="space-y-4">
          <div>
            <p className="ui-eyebrow">All Logs</p>
            <h2 className="ui-section-title mt-1 text-[1.7rem]">By Date</h2>
            {currentWindowSummary ? (
              <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">
                Showing {currentWindowSummary}
                {canLoadMore ? ". Load more to include older logs." : "."}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface)] p-3">
              <p className="ui-eyebrow">Visible Logs</p>
              <p className="font-display mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                {visibleLogs.length}
              </p>
            </div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface)] p-3">
              <p className="ui-eyebrow">Visible Days</p>
              <p className="font-display mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                {groups.length}
              </p>
            </div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface)] p-3">
              <p className="ui-eyebrow">Record</p>
              <p className="font-display mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                {totalWins}-{totalLosses}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="ui-eyebrow">Workspace Tools</p>
            {canLoadMore ? <Badge>More available</Badge> : <Badge>Current window complete</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="gap-2"
              onClick={() => setIsManagementMode((current) => !current)}
              variant="secondary"
            >
              <PencilIcon className="h-4 w-4" />
              {isManagementMode ? "Done Editing" : "Edit Logs"}
            </Button>

            {isManagementMode ? (
              <>
                <button
                  className="ui-control-text text-[var(--text-muted)] transition hover:text-[var(--color-loss-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canDeleteSelected}
                  onClick={handleDeleteSelected}
                  type="button"
                >
                  Delete Selected{selectedCount ? ` (${selectedCount})` : ""}
                </button>

                {visibleLogs.length > 0 ? (
                  <label className="ui-control-text inline-flex cursor-pointer items-center gap-3 text-[var(--text-muted)]">
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
          </div>

          <p className="text-sm leading-6 text-[var(--text-muted)]">
            Review grouped results, bulk-link saved deck lists, or switch into editing mode to
            clean up imported logs.
          </p>
        </div>
      </section>

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
              {isMutating ? "Applying..." : "Apply to Selected"}
            </Button>
          </div>

          <p className="text-sm text-[var(--text-muted)] lg:col-span-3">
            Apply one saved deck list to the {selectedCount} selected battle log
            {selectedCount === 1 ? "" : "s"}.
          </p>
        </section>
      ) : null}

      {groups.length > 0 ? (
        groups.map((group, index) => (
          <details
            className="group rounded-[22px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-1 shadow-[var(--shadow-sm)]"
            key={group.date}
            open={index === 0}
          >
            <summary className="grid cursor-pointer list-none gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center [&::-webkit-details-marker]:hidden">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                <h3 className="font-display text-[1.08rem] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
                  {formatGroupDate(group.date)}
                </h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {group.logs.length} log{group.logs.length === 1 ? "" : "s"}
                </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Badge className="justify-center min-w-[6.25rem]" variant="win">
                    {group.wins} wins
                  </Badge>
                  <Badge className="justify-center min-w-[6.25rem]" variant="loss">
                    {group.losses} losses
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.04em] text-[var(--text-primary)]">
                    {group.wins}-{group.losses}
                  </p>
                  <p className="mt-1 text-[0.95rem] leading-none text-[var(--text-muted)]">
                    {group.logs.length} total
                  </p>
                </div>
                <ChevronIcon className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-open:rotate-180" />
              </div>
            </summary>

            <div className="flex flex-col gap-3 border-t border-[var(--border)] pb-5 pt-4">
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
          </details>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface-alt)] p-6 text-sm text-[var(--text-muted)]">
          {canLoadMore
            ? "No logs appear in the currently loaded 7-day window yet. Load more logs to keep going further back."
            : "No battle logs yet. Import your first PTCGL log to start tracking results."}
        </div>
      )}

      {canLoadMore ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {loadMoreError ? (
            <p className="text-sm font-medium text-[var(--color-loss-strong)]">{loadMoreError}</p>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Continue loading older windows to extend the visible log history.
            </p>
          )}
          <Button disabled={isLoadingMore} onClick={handleLoadMore} variant="secondary">
            {isLoadingMore ? "Loading Older Logs..." : "Load More Logs"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
