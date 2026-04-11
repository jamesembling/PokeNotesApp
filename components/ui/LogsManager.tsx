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
import { ClientPerfPanel } from "@/components/ui/ClientPerfPanel";
import { ChevronIcon, PencilIcon } from "@/components/ui/icons";
import { LazyEditLogButton } from "@/components/ui/LazyEditLogButton";
import { LogRow } from "@/components/ui/LogRow";
import { formatDayDate } from "@/lib/client/date-format";
import type { BattleLog, BattleLogSummary, DeckSummary } from "@/types/index";

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
  userDecks: DeckSummary[];
};

function summarizeVisibleLogs(logs: BattleLogSummary[]) {
  const groups = new Map<string, LogGroup>();
  let totalWins = 0;
  let totalLosses = 0;

  logs.forEach((log) => {
    if (log.result === "Win") {
      totalWins += 1;
    } else {
      totalLosses += 1;
    }

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

  return {
    groups: Array.from(groups.values()),
    totalWins,
    totalLosses
  };
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
  userDecks
}: LogsManagerProps) {
  const router = useRouter();
  const [isMutating, startMutationTransition] = useTransition();
  const [isLoadingMore, startLoadMoreTransition] = useTransition();
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
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
  const [openGroupDates, setOpenGroupDates] = useState<string[]>(() =>
    initialLogs.length > 0 ? [initialLogs[0].date] : []
  );

  const visibleSummary = useMemo(() => summarizeVisibleLogs(visibleLogs), [visibleLogs]);
  const groups = visibleSummary.groups;
  const selectedDeck = useMemo(
    () => userDecks.find((deck) => deck.id === selectedDeckId) ?? null,
    [selectedDeckId, userDecks]
  );
  const availableDeckLists = selectedDeck?.deckLists ?? [];
  const selectedLogIdSet = useMemo(() => new Set(selectedLogIds), [selectedLogIds]);
  const allSelected = visibleLogs.length > 0 && selectedLogIds.length === visibleLogs.length;
  const selectedCount = selectedLogIds.length;
  const managementModeActive = isManagementMode && isDesktopViewport;
  const canApplyDeckList =
    selectedCount > 0 && Boolean(selectedDeckId) && Boolean(selectedDeckListId) && !isMutating;
  const canDeleteSelected = selectedCount > 0 && !isMutating;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  useEffect(() => {
    setVisibleLogs(initialLogs);
    setCanLoadMore(initialCanLoadMore);
    setNextWindowEndDate(initialNextWindowEndDate);
    setWindowStartDate(initialWindowStartDate);
    setWindowEndDate(initialWindowEndDate);
    setLoadMoreError("");
    setOpenGroupDates(initialLogs.length > 0 ? [initialLogs[0].date] : []);
  }, [
    initialCanLoadMore,
    initialLogs,
    initialNextWindowEndDate,
    initialWindowEndDate,
    initialWindowStartDate
  ]);

  useEffect(() => {
    if (!managementModeActive && selectedLogIds.length > 0) {
      setSelectedLogIds([]);
    }
  }, [managementModeActive, selectedLogIds.length]);

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

  useEffect(() => {
    if (!groups.length) {
      setOpenGroupDates([]);
      return;
    }

    setOpenGroupDates((current) => {
      const validDates = new Set(groups.map((group) => group.date));
      const filtered = current.filter((date) => validDates.has(date));

      if (filtered.length > 0) {
        return filtered;
      }

      return [groups[0].date];
    });
  }, [groups]);

  function toggleSelectedLog(logId: string) {
    setSelectedLogIds((current) =>
      current.includes(logId) ? current.filter((id) => id !== logId) : [...current, logId]
    );
  }

  function toggleSelectAll() {
    setSelectedLogIds(allSelected ? [] : visibleLogs.map((log) => log.id));
  }

  function toggleGroup(date: string, isOpen: boolean) {
    setOpenGroupDates((current) => {
      if (isOpen) {
        return current.includes(date) ? current : [...current, date];
      }

      return current.filter((value) => value !== date);
    });
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
      <section className="hidden gap-5 rounded-[22px] border border-[var(--border)] bg-[var(--bg-surface-alt)] p-5 sm:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="ui-eyebrow">Workspace Tools</p>
            {!canLoadMore ? <Badge>Current window complete</Badge> : null}
          </div>

          <div className="space-y-2">
            <h2 className="ui-section-title">Manage Battle Logs</h2>
            <p className="max-w-[58ch] text-sm leading-6 text-[var(--text-muted)]">
              {managementModeActive
                ? "Select logs below to delete bad imports or bulk-apply a saved deck list."
                : "Turn on editing to select multiple logs, remove bad imports, and apply saved deck lists in bulk."}
            </p>
          </div>

          {managementModeActive ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
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
                  <span>Select All In View</span>
                </label>
              ) : null}
            </div>
          ) : null}

          {managementModeActive ? (
            <div className="grid gap-3 border-t border-[var(--border)] pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
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

              <div className="flex lg:justify-end">
                <Button
                  className="w-full justify-center lg:w-auto"
                  disabled={!canApplyDeckList}
                  onClick={handleApplyDeckList}
                >
                  {isMutating ? "Applying..." : "Apply to Selected"}
                </Button>
              </div>

              <p className="text-sm text-[var(--text-muted)] lg:col-span-3">
                Apply one saved deck list to the {selectedCount} selected battle log
                {selectedCount === 1 ? "" : "s"}.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <Button
            className="gap-2 justify-center lg:min-w-[12rem]"
            onClick={() => setIsManagementMode((current) => !current)}
            variant="secondary"
          >
            <PencilIcon className="h-4 w-4" />
            {managementModeActive ? "Done Editing" : "Edit Logs"}
          </Button>

          <p className="text-sm text-[var(--text-muted)] lg:max-w-[18rem] lg:text-right">
            {managementModeActive
              ? "Bulk actions stay available while editing is on."
              : "Editing mode unlocks selection and bulk actions."}
          </p>
        </div>
      </section>

      <ClientPerfPanel
        expandedGroupCount={openGroupDates.length}
        totalGroupCount={groups.length}
        visibleLogCount={visibleLogs.length}
      />

      {groups.length > 0 ? (
        <div className="divide-y divide-[var(--border)] rounded-[24px] border border-[var(--border)] bg-[var(--bg-surface)]">
          {groups.map((group, index) => (
            <details
              className="group px-4 py-1 first:rounded-t-[24px] last:rounded-b-[24px] sm:px-5"
              key={group.date}
              onToggle={(event) => toggleGroup(group.date, event.currentTarget.open)}
              open={openGroupDates.includes(group.date) || (index === 0 && openGroupDates.length === 0)}
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "128px"
              }}
            >
              <summary className="grid cursor-pointer list-none gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center [&::-webkit-details-marker]:hidden">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div>
                    <div className="flex items-start justify-between gap-3 sm:block">
                      <div>
                        <h3 className="font-display text-[1.08rem] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
                          {formatDayDate(group.date)}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          <span className="sm:hidden">
                            {group.logs.length} log{group.logs.length === 1 ? "" : "s"}
                          </span>
                          <span className="hidden sm:inline">
                            {group.logs.length} log{group.logs.length === 1 ? "" : "s"}
                          </span>
                        </p>
                      </div>

                      <div className="text-right sm:hidden">
                        <p className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.04em] text-[var(--text-primary)]">
                          {group.wins}-{group.losses}
                        </p>
                        <div className="mt-1 flex justify-end">
                          <ChevronIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-open:rotate-180" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="hidden w-[13rem] grid-cols-2 gap-2 self-center sm:grid">
                    <Badge className="w-full justify-center self-center" variant="win">
                      {group.wins} wins
                    </Badge>
                    <Badge className="w-full justify-center self-center" variant="loss">
                      {group.losses} losses
                    </Badge>
                  </div>
                </div>
                <div className="hidden items-center self-center lg:flex lg:gap-2.5">
                  <div className="text-right">
                    <p className="hidden font-display text-[1.5rem] font-semibold leading-none tracking-[-0.04em] text-[var(--text-primary)] lg:block">
                      {group.wins}-{group.losses}
                    </p>
                    <p className="mt-1 hidden text-[0.95rem] leading-none text-[var(--text-muted)] lg:block">
                      {group.logs.length} total
                    </p>
                  </div>
                  <ChevronIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-open:rotate-180" />
                </div>
              </summary>

              {openGroupDates.includes(group.date) ? (
                <div className="flex flex-col gap-3 pb-5 pt-2">
                  {group.logs.map((log) => (
                    <LogRow
                      editAction={
                        <LazyEditLogButton
                          log={toEditableLog(log)}
                          trigger={
                            <button
                              aria-label="Edit battle log"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--color-brand)]"
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
                      managementMode={managementModeActive}
                      onDelete={() => handleDeleteSingle(log.id)}
                      onToggleSelected={() => toggleSelectedLog(log.id)}
                      selected={selectedLogIdSet.has(log.id)}
                    />
                  ))}
                </div>
              ) : null}
            </details>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface-alt)] p-6 text-sm text-[var(--text-muted)]">
          {canLoadMore
            ? "No logs appear in the currently loaded 7-day window yet. Load more logs to keep going further back."
            : "No battle logs yet. Import your first PTCGL log to start tracking results."}
        </div>
      )}

      {canLoadMore ? (
        <div
          className={`flex flex-wrap items-center gap-3 ${
            loadMoreError ? "justify-between" : "justify-end"
          }`}
        >
          {loadMoreError ? (
            <p className="text-sm font-medium text-[var(--color-loss-strong)]">{loadMoreError}</p>
          ) : null}
          <Button disabled={isLoadingMore} onClick={handleLoadMore} variant="secondary">
            {isLoadingMore ? "Loading Older Logs..." : "Load More Logs"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
