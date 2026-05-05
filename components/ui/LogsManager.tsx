"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkAssignDeckListAction,
  deleteLogAction,
  deleteLogsAction,
  loadMoreLogsAction
} from "@/app/(app)/logs/actions";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Badge } from "@/components/ui/Badge";
import { AppSelect } from "@/components/ui/AppSelect";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClientPerfPanel } from "@/components/ui/ClientPerfPanel";
import { DeleteConfirmDialog } from "@/components/ui/DeleteConfirmDialog";
import { ChevronIcon, PencilIcon } from "@/components/ui/icons";
import { DropdownMenuItem } from "@/components/shadcn/dropdown-menu";
import { LazyEditLogButton } from "@/components/ui/LazyEditLogButton";
import { LogRow } from "@/components/ui/LogRow";
import { formatDayDate } from "@/lib/client/date-format";
import type { BattleLog, BattleLogSummary, DeckSelectionOption } from "@/types/index";

type LogGroup = {
  date: string;
  logs: BattleLogSummary[];
  wins: number;
  losses: number;
};

type ActionNotice = {
  kind: "error";
  message: string;
};

type DeletePrompt = {
  ids: string[];
  message: string;
};

export type LogsManagerProps = {
  initialCanLoadMore: boolean;
  initialLogs: BattleLogSummary[];
  initialNextWindowEndDate: string;
  initialWindowEndDate: string;
  initialWindowStartDate: string;
  initialUserDecks?: DeckSelectionOption[];
};

type DeckSelectionOptionsResponse = {
  userDecks?: DeckSelectionOption[];
};

let battleLogDetailAssetsWarmed = false;

function warmBattleLogDetailAssets() {
  if (battleLogDetailAssetsWarmed || typeof window === "undefined") {
    return;
  }

  battleLogDetailAssetsWarmed = true;

  const warm = () => {
    void Promise.all([
      import("@/components/ui/BattleLogDetailShell"),
      import("@/components/ui/BattleLogDetailView")
    ]);
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(warm, { timeout: 1500 });
    return;
  }

  globalThis.setTimeout(warm, 250);
}

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
    selfMulligans: 0,
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

function attachLinkedDeckListNames(logs: BattleLogSummary[], userDecks: DeckSelectionOption[]) {
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
  initialUserDecks = []
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
  const [deckOptionsError, setDeckOptionsError] = useState("");
  const [isLoadingDeckOptions, setIsLoadingDeckOptions] = useState(false);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);
  const [userDecks, setUserDecks] = useState(initialUserDecks);
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
  const managementModeActive = isManagementMode;
  const canApplyDeckList =
    selectedCount > 0 && Boolean(selectedDeckId) && Boolean(selectedDeckListId) && !isMutating;
  const canDeleteSelected = selectedCount > 0 && !isMutating;
  const deletePromptCount = deletePrompt?.ids.length ?? 0;

  useEffect(() => {
    setVisibleLogs(userDecks.length > 0 ? attachLinkedDeckListNames(initialLogs, userDecks) : initialLogs);
    setCanLoadMore(initialCanLoadMore);
    setNextWindowEndDate(initialNextWindowEndDate);
    setWindowStartDate(initialWindowStartDate);
    setWindowEndDate(initialWindowEndDate);
    setLoadMoreError("");
    setActionNotice(null);
    setDeletePrompt(null);
    setOpenGroupDates(initialLogs.length > 0 ? [initialLogs[0].date] : []);
  }, [
    initialCanLoadMore,
    initialLogs,
    initialNextWindowEndDate,
    initialWindowEndDate,
    initialWindowStartDate,
    userDecks
  ]);

  useEffect(() => {
    if (initialUserDecks.length > 0) {
      setUserDecks(initialUserDecks);
    }
  }, [initialUserDecks]);

  async function loadDeckOptions() {
    if (userDecks.length > 0 || isLoadingDeckOptions) {
      return;
    }

    setIsLoadingDeckOptions(true);
    setDeckOptionsError("");

    try {
      const response = await fetch("/api/deck-selection-options", {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Could not load deck strategies.");
      }

      const payload = (await response.json()) as DeckSelectionOptionsResponse;
      setUserDecks(Array.isArray(payload.userDecks) ? payload.userDecks : []);
    } catch (error) {
      console.error(error);
      setDeckOptionsError("Couldn't load deck strategies right now.");
    } finally {
      setIsLoadingDeckOptions(false);
    }
  }

  useEffect(() => {
    if (userDecks.length === 0) {
      return;
    }

    setVisibleLogs((current) => attachLinkedDeckListNames(current, userDecks));
  }, [userDecks]);

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

  useEffect(() => {
    warmBattleLogDetailAssets();
  }, []);

  function toggleSelectedLog(logId: string) {
    setSelectedLogIds((current) =>
      current.includes(logId) ? current.filter((id) => id !== logId) : [...current, logId]
    );
  }

  function toggleSelectAll() {
    setSelectedLogIds(allSelected ? [] : visibleLogs.map((log) => log.id));
  }

  function toggleManagementMode() {
    setIsManagementMode((current) => {
      const next = !current;

      if (next) {
        void loadDeckOptions();
      }

      return next;
    });
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
    setActionNotice(null);
    startMutationTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (error) {
        console.error(error);
        setActionNotice({
          kind: "error",
          message: "We could not finish that action. Please try again."
        });
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
        console.error(error);
        setLoadMoreError("Couldn't load more logs right now. Please try again.");
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

    setDeletePrompt({
      ids: selectedLogIds,
      message: `Delete ${selectedCount} battle log${selectedCount === 1 ? "" : "s"}? This cannot be undone.`
    });
  }

  function handleDeleteSingle(logId: string) {
    setDeletePrompt({
      ids: [logId],
      message: "Delete this battle log? This cannot be undone."
    });
  }

  function cancelDeletePrompt() {
    setDeletePrompt(null);
  }

  function confirmDeletePrompt() {
    if (!deletePrompt) {
      return;
    }

    const idsToDelete = deletePrompt.ids;
    setDeletePrompt(null);
    runAsyncAction(async () => {
      if (idsToDelete.length === 1) {
        await deleteLogAction(idsToDelete[0]);
      } else {
        await deleteLogsAction(idsToDelete);
      }
      setSelectedLogIds((current) => current.filter((id) => !idsToDelete.includes(id)));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <DeleteConfirmDialog
        confirmLabel={`Delete${deletePromptCount > 1 ? ` ${deletePromptCount} Logs` : " Log"}`}
        description={
          deletePromptCount > 1
            ? `${deletePromptCount} logs are selected for removal.`
            : undefined
        }
        message={deletePrompt?.message ?? ""}
        onCancel={cancelDeletePrompt}
        onConfirm={confirmDeletePrompt}
        open={Boolean(deletePrompt)}
      />

      {actionNotice ? (
        <Card
          aria-live="polite"
          className="border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss)]"
        >
          <p className="ui-eyebrow">Action Failed</p>
          <p className="mt-2 text-sm leading-6">{actionNotice.message}</p>
        </Card>
      ) : null}

      <section className="grid gap-5 py-2 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-center">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="ui-eyebrow">Workspace Tools</p>
            {!canLoadMore ? <Badge>Current window complete</Badge> : null}
          </div>

          <div className="space-y-2">
            <h2 className="ui-section-title">Manage Battle Logs</h2>
          </div>

          {managementModeActive ? (
            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-3">
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
                  <Checkbox
                    checked={allSelected}
                    className="h-5 w-5 cursor-pointer rounded border-[var(--border)] bg-[var(--bg-surface)]"
                    onCheckedChange={toggleSelectAll}
                  />
                  <span>Select All In View</span>
                </label>
              ) : null}
            </div>
          ) : null}

          {managementModeActive ? (
            <div className="grid gap-3 border-t border-[var(--border)] pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
              {deckOptionsError ? (
                <p className="text-sm text-[var(--color-loss)] md:col-span-2 xl:col-span-3">
                  {deckOptionsError}
                </p>
              ) : null}
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Deck Strategy</span>
                <AppSelect
                  className="min-h-[3rem] bg-[var(--bg-surface)] px-4 py-3"
                  onChange={setSelectedDeckId}
                  options={[
                    {
                      label: isLoadingDeckOptions ? "Loading deck strategies..." : "Select deck strategy",
                      value: ""
                    },
                    ...userDecks.map((deck) => ({
                      label: deck.deckName,
                      value: deck.id
                    }))
                  ]}
                  value={selectedDeckId}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Deck List</span>
                <AppSelect
                  className="min-h-[3rem] bg-[var(--bg-surface)] px-4 py-3"
                  disabled={!selectedDeck || availableDeckLists.length === 0}
                  onChange={setSelectedDeckListId}
                  options={[
                    {
                      label: selectedDeck
                        ? availableDeckLists.length > 0
                          ? "Select deck list"
                          : "No saved deck lists yet"
                        : "Choose a deck strategy first",
                      value: ""
                    },
                    ...availableDeckLists.map((deckList) => ({
                      label: deckList.name,
                      value: deckList.id
                    }))
                  ]}
                  value={selectedDeckListId}
                />
              </label>

              <div className="flex md:col-span-2 xl:col-span-1 xl:justify-end">
                <Button
                  className="w-full justify-center xl:w-auto"
                  disabled={!canApplyDeckList}
                  onClick={handleApplyDeckList}
                >
                  {isMutating ? "Applying..." : "Apply to Selected"}
                </Button>
              </div>

              <p className="text-sm text-[var(--text-muted)] md:col-span-2 xl:col-span-3">
                Apply one saved deck list to the {selectedCount} selected battle log
                {selectedCount === 1 ? "" : "s"}.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 xl:items-end xl:self-center">
          <Button
            className="gap-2 justify-center xl:min-w-[12rem]"
            onClick={toggleManagementMode}
            variant="secondary"
          >
            <PencilIcon className="h-4 w-4" />
            {managementModeActive ? "Done Editing" : "Edit Logs"}
          </Button>
        </div>
      </section>

      <ClientPerfPanel
        expandedGroupCount={openGroupDates.length}
        totalGroupCount={groups.length}
        visibleLogCount={visibleLogs.length}
      />

      {groups.length > 0 ? (
        <div>
          {groups.map((group, index) => (
            <details
              className="group border-b border-[var(--border)] last:border-b-0"
              key={group.date}
              onToggle={(event) => toggleGroup(group.date, event.currentTarget.open)}
              open={openGroupDates.includes(group.date) || (index === 0 && openGroupDates.length === 0)}
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "128px"
              }}
            >
              <summary className="cursor-pointer list-none py-5 [&::-webkit-details-marker]:hidden">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <div className="flex items-start justify-between gap-3 sm:block">
                        <div>
                          <h3 className="font-display text-[1.08rem] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
                            {formatDayDate(group.date)}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            {group.logs.length} log{group.logs.length === 1 ? "" : "s"}
                          </p>
                        </div>

                        <div className="text-right sm:hidden">
                          <p className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.04em] text-[var(--text-primary)]">
                            {group.wins}-{group.losses}
                          </p>
                          <div className="mt-1 flex items-center justify-end gap-2 text-[0.8rem] text-[var(--text-muted)]">
                            <span>{group.logs.length} total</span>
                            <ChevronIcon className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
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
                      <p className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.04em] text-[var(--text-primary)]">
                        {group.wins}-{group.losses}
                      </p>
                      <p className="mt-1 text-[0.95rem] leading-none text-[var(--text-muted)]">
                        {group.logs.length} total
                      </p>
                    </div>
                    <ChevronIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-open:rotate-180" />
                  </div>
                </div>
              </summary>

              {openGroupDates.includes(group.date) ? (
                <div className="flex flex-col gap-3 border-t border-[var(--border)] pb-5 pt-4">
                  {group.logs.map((log) => (
                    <div className="flex flex-col gap-3" key={log.id}>
                      <LogRow
                        editAction={
                          <LazyEditLogButton
                            log={toEditableLog(log)}
                            trigger={
                              <DropdownMenuItem>
                                <PencilIcon className="h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            }
                            userDecks={userDecks}
                          />
                        }
                        log={log}
                        managementMode={managementModeActive}
                        onDelete={() => handleDeleteSingle(log.id)}
                        onToggleSelected={() => toggleSelectedLog(log.id)}
                        selected={selectedLogIdSet.has(log.id)}
                      />

                    </div>
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
