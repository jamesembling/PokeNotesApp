"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  bulkAssignDeckListAction,
  deleteLogAction,
  deleteLogsAction,
  loadMoreLogsAction
} from "@/app/(app)/logs/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { ClientPerfPanel } from "@/components/ui/ClientPerfPanel";
import { ChevronIcon, PencilIcon } from "@/components/ui/icons";
import { DropdownMenuItem } from "@/components/shadcn/dropdown-menu";
import { LogRow } from "@/components/ui/LogRow";
import { useLogsRefresh } from "@/components/ui/LogsRefreshContext";
import type { BulkLogMutationResult } from "@/lib/battle-log/bulk-mutation";
import { useLogsManagementMode } from "@/components/ui/LogsWorkspaceFrame";
import { ItemTitle } from "@/components/ui/Typography";
import { formatDayDate } from "@/lib/client/date-format";
import { composeDeckListNameOptions, resolveDeckListName } from "@/lib/deck-lists/resolve-name";
import {
  makeDeckListSelectionKey,
  parseDeckListSelectionKey,
  selectDeck,
  selectDeckList,
  type DeckListSelectionState
} from "@/lib/log-import/deck-list-selection";
import type {
  BattleLog,
  BattleLogSummary,
  DeckListSelectionOption,
  DeckSelectionOption
} from "@/types/index";

type LogGroup = {
  date: string;
  logs: BattleLogSummary[];
  wins: number;
  losses: number;
};

type ActionNotice = {
  kind: "error" | "info";
  message: string;
};

type DeletePrompt = {
  ids: string[];
  message: string;
};

export type LogsManagerProps = {
  onLoadedWindowChange?: (oldestLog: BattleLogSummary | null) => void;
  initialCanLoadMore: boolean;
  initialLogs: BattleLogSummary[];
  initialNextWindowEndDate: string;
  initialWindowEndDate: string;
  initialWindowStartDate: string;
  initialUserDeckLists?: DeckListSelectionOption[];
  initialUserDecks?: DeckSelectionOption[];
};

type DeckSelectionOptionsResponse = {
  deckLists?: DeckListSelectionOption[];
  userDecks?: DeckSelectionOption[];
};

const DynamicDeleteConfirmDialog = dynamic(
  () => import("@/components/ui/DeleteConfirmDialog").then((module) => module.DeleteConfirmDialog),
  { ssr: false }
);

const DynamicLazyEditLogButton = dynamic(
  () => import("@/components/ui/LazyEditLogButton").then((module) => module.LazyEditLogButton),
  { ssr: false }
);

const DynamicLogsManagementDock = dynamic(
  () => import("@/components/ui/LogsManagementDock").then((module) => module.LogsManagementDock),
  { ssr: false }
);

let battleLogDetailAssetsWarmed = false;
const warmedBattleLogDetailRoutes = new Set<string>();
const DETAIL_ROUTE_PREFETCH_DWELL_MS = 500;

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
    matchNotes: null,
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

function attachLinkedDeckListNames(
  logs: BattleLogSummary[],
  userDecks: DeckSelectionOption[],
  userDeckLists: DeckListSelectionOption[]
) {
  const options = composeDeckListNameOptions(userDeckLists, userDecks);

  return logs.map((log) => {
    if (!log.linkedDeckListId) {
      return log;
    }

    return {
      ...log,
      linkedDeckListName:
        resolveDeckListName(options, log.linkedDeckId, log.linkedDeckListId) ??
        log.linkedDeckListName
    };
  });
}

export function LogsManager({
  initialCanLoadMore,
  initialLogs,
  onLoadedWindowChange,
  initialNextWindowEndDate,
  initialWindowEndDate,
  initialWindowStartDate,
  initialUserDeckLists = [],
  initialUserDecks = []
}: LogsManagerProps) {
  const router = useRouter();
  const refreshLogs = useLogsRefresh();
  const { isManagementMode } = useLogsManagementMode();
  const pendingDetailRouteWarm = useRef<{
    href: string;
    timeoutId: ReturnType<typeof globalThis.setTimeout>;
  } | null>(null);
  const [isMutating, startMutationTransition] = useTransition();
  const [isLoadingMore, startLoadMoreTransition] = useTransition();
  const deckOptionsLoadAttempted = useRef(false);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedDeckListSelectionKey, setSelectedDeckListSelectionKey] = useState("");
  const [visibleLogs, setVisibleLogs] = useState(() =>
    initialUserDecks.length > 0 || initialUserDeckLists.length > 0
      ? attachLinkedDeckListNames(initialLogs, initialUserDecks, initialUserDeckLists)
      : initialLogs
  );
  const [canLoadMore, setCanLoadMore] = useState(initialCanLoadMore);
  const nextWindowEndDateRef = useRef(initialNextWindowEndDate);
  const windowStartDateRef = useRef(initialWindowStartDate);
  const windowEndDateRef = useRef(initialWindowEndDate);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [deckOptionsError, setDeckOptionsError] = useState("");
  const [isLoadingDeckOptions, setIsLoadingDeckOptions] = useState(false);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);
  const [editingLog, setEditingLog] = useState<BattleLog | null>(null);
  const [editRequestId, setEditRequestId] = useState(0);
  const [userDecks, setUserDecks] = useState(initialUserDecks);
  const [userDeckLists, setUserDeckLists] = useState(initialUserDeckLists);
  const [openGroupDates, setOpenGroupDates] = useState<string[]>(() =>
    initialLogs.length > 0 ? [initialLogs[0].date] : []
  );
  const visibleSummary = useMemo(() => summarizeVisibleLogs(visibleLogs), [visibleLogs]);
  const groups = visibleSummary.groups;
  const availableDeckLists = userDeckLists;
  const selectedDeckListId =
    parseDeckListSelectionKey(selectedDeckListSelectionKey)?.deckListId ?? "";

  function applyDeckListSelection(next: DeckListSelectionState) {
    setSelectedDeckId(next.deckId);
    setSelectedDeckListSelectionKey(next.selectionKey);
  }

  function handleDeckChange(nextDeckId: string) {
    applyDeckListSelection(
      selectDeck(
        {
          deckId: selectedDeckId,
          deckListId: selectedDeckListId,
          selectionKey: selectedDeckListSelectionKey
        },
        nextDeckId,
        availableDeckLists
      )
    );
  }

  function handleDeckListChange(nextSelectionKey: string) {
    applyDeckListSelection(
      selectDeckList(
        {
          deckId: selectedDeckId,
          deckListId: selectedDeckListId,
          selectionKey: selectedDeckListSelectionKey
        },
        nextSelectionKey,
        availableDeckLists
      )
    );
  }
  const selectedLogIdSet = useMemo(() => new Set(selectedLogIds), [selectedLogIds]);
  const allSelected = visibleLogs.length > 0 && selectedLogIds.length === visibleLogs.length;
  const selectedCount = selectedLogIds.length;
  const managementModeActive = isManagementMode;
  const canApplyDeckList = selectedCount > 0 && Boolean(selectedDeckListId) && !isMutating;
  const canDeleteSelected = selectedCount > 0 && !isMutating;
  const deletePromptCount = deletePrompt?.ids.length ?? 0;

  useEffect(() => {
    setVisibleLogs(initialLogs);
    setCanLoadMore(initialCanLoadMore);
    nextWindowEndDateRef.current = initialNextWindowEndDate;
    windowStartDateRef.current = initialWindowStartDate;
    windowEndDateRef.current = initialWindowEndDate;
    setLoadMoreError("");
    setDeletePrompt(null);
  }, [
    initialCanLoadMore,
    initialLogs,
    initialNextWindowEndDate,
    initialWindowEndDate,
    initialWindowStartDate
  ]);

  useEffect(() => {
    if (initialUserDecks.length > 0) {
      setUserDecks(initialUserDecks);
    }
  }, [initialUserDecks]);

  useEffect(() => {
    if (initialUserDeckLists.length > 0) {
      setUserDeckLists(initialUserDeckLists);
    }
  }, [initialUserDeckLists]);

  async function loadDeckOptions() {
    if (userDecks.length > 0 || isLoadingDeckOptions) {
      return;
    }

    deckOptionsLoadAttempted.current = true;
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
      setUserDeckLists(Array.isArray(payload.deckLists) ? payload.deckLists : []);
    } catch (error) {
      console.error(error);
      setDeckOptionsError("Couldn't load deck strategies right now.");
    } finally {
      setIsLoadingDeckOptions(false);
    }
  }

  useEffect(() => {
    if (!managementModeActive) {
      deckOptionsLoadAttempted.current = false;
      return;
    }

    if (
      !deckOptionsLoadAttempted.current &&
      userDecks.length === 0 &&
      userDeckLists.length === 0 &&
      !isLoadingDeckOptions
    ) {
      void loadDeckOptions();
    }
  }, [isLoadingDeckOptions, managementModeActive, userDeckLists.length, userDecks.length]);

  useEffect(() => {
    return () => {
      if (pendingDetailRouteWarm.current) {
        globalThis.clearTimeout(pendingDetailRouteWarm.current.timeoutId);
        pendingDetailRouteWarm.current = null;
      }
    };
  }, []);

  function cancelDetailRouteWarm(logId: string) {
    const href = `/logs/${logId}`;
    if (pendingDetailRouteWarm.current?.href !== href) {
      return;
    }

    globalThis.clearTimeout(pendingDetailRouteWarm.current.timeoutId);
    pendingDetailRouteWarm.current = null;
  }

  function scheduleDetailRouteWarm(logId: string) {
    warmBattleLogDetailAssets();

    const href = `/logs/${logId}`;
    if (warmedBattleLogDetailRoutes.has(href) || pendingDetailRouteWarm.current?.href === href) {
      return;
    }

    if (pendingDetailRouteWarm.current) {
      globalThis.clearTimeout(pendingDetailRouteWarm.current.timeoutId);
    }

    const timeoutId = globalThis.setTimeout(() => {
      pendingDetailRouteWarm.current = null;
      warmedBattleLogDetailRoutes.add(href);
      router.prefetch(href);
    }, DETAIL_ROUTE_PREFETCH_DWELL_MS);

    pendingDetailRouteWarm.current = { href, timeoutId };
  }

  useEffect(() => {
    if (userDecks.length === 0 && userDeckLists.length === 0) {
      return;
    }

    setVisibleLogs((current) => attachLinkedDeckListNames(current, userDecks, userDeckLists));
  }, [initialLogs, userDeckLists, userDecks]);

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
    if (availableDeckLists.length === 0 || !selectedDeckListSelectionKey) {
      return;
    }

    const deckList = availableDeckLists.find(
      (option) =>
        (option.selectionKey ??
          makeDeckListSelectionKey({
            deckId: option.deckId,
            deckListId: option.id
          })) === selectedDeckListSelectionKey
    );
    if (!deckList) {
      setSelectedDeckListSelectionKey("");
    } else if (selectedDeckId && deckList.deckId !== selectedDeckId) {
      setSelectedDeckListSelectionKey("");
    }
  }, [availableDeckLists, selectedDeckId, selectedDeckListSelectionKey]);

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

  useEffect(() => {
    onLoadedWindowChange?.(visibleLogs[visibleLogs.length - 1] ?? null);
  }, [onLoadedWindowChange, visibleLogs]);

  function reportBulkResult(result: BulkLogMutationResult, verb: string) {
    if (result.missingIds.length) {
      setActionNotice({
        kind: "info",
        message: `${result.affectedIds.length} battle log${result.affectedIds.length === 1 ? "" : "s"} ${verb}. ${result.missingIds.length} selected log${result.missingIds.length === 1 ? " is" : "s are"} no longer available.`
      });
    }
    const completed = new Set([...result.affectedIds, ...result.missingIds]);
    setSelectedLogIds((current) => current.filter((id) => !completed.has(id)));
  }

  function runAsyncAction(work: () => Promise<void>) {
    setActionNotice(null);
    startMutationTransition(async () => {
      try {
        await work();
        if (refreshLogs) await refreshLogs();
        else router.refresh();
      } catch (error) {
        console.error(error);
        setActionNotice({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "We could not finish that action. Please try again."
        });
      }
    });
  }

  function handleLoadMore() {
    if (isLoadingMore || isMutating || !canLoadMore) {
      return;
    }

    startLoadMoreTransition(async () => {
      try {
        setLoadMoreError("");
        const result = await loadMoreLogsAction(nextWindowEndDateRef.current);
        const nextLogs = attachLinkedDeckListNames(result.logs, userDecks, userDeckLists);

        setVisibleLogs((current) => mergeLogs(current, nextLogs));
        setCanLoadMore(result.hasMore);
        nextWindowEndDateRef.current = result.nextWindowEndDate;
        windowStartDateRef.current = result.windowStartDate;
        windowEndDateRef.current = windowEndDateRef.current || result.windowEndDate;
      } catch (error) {
        console.error(error);
        setLoadMoreError("Couldn't load more logs right now. Please try again.");
      }
    });
  }

  function handleApplyDeckList() {
    runAsyncAction(async () => {
      const result = await bulkAssignDeckListAction({
        logIds: selectedLogIds,
        linkedDeckId: selectedDeckId,
        linkedDeckListId: selectedDeckListId
      });
      reportBulkResult(result, "updated");
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
      const result =
        idsToDelete.length === 1
          ? await deleteLogAction(idsToDelete[0])
          : await deleteLogsAction(idsToDelete);
      reportBulkResult(result, "deleted");
    });
  }

  return (
    <div className={`flex flex-col ${managementModeActive ? "pb-72 md:pb-20" : ""}`}>
      {deletePrompt ? (
        <DynamicDeleteConfirmDialog
          confirmLabel={`Delete${deletePromptCount > 1 ? ` ${deletePromptCount} Logs` : " Log"}`}
          description={
            deletePromptCount > 1
              ? `${deletePromptCount} logs are selected for removal.`
              : undefined
          }
          message={deletePrompt.message}
          onCancel={cancelDeletePrompt}
          onConfirm={confirmDeletePrompt}
          open
        />
      ) : null}

      {actionNotice ? (
        <Alert
          aria-live="polite"
          className={
            actionNotice.kind === "error"
              ? "border-loss-border bg-loss-bg text-loss-strong"
              : undefined
          }
          variant={actionNotice.kind === "error" ? "destructive" : "default"}
        >
          <AlertTitle>
            {actionNotice.kind === "error" ? "Action failed" : "Logs updated"}
          </AlertTitle>
          <AlertDescription>{actionNotice.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-6 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:hidden">
          <div className="flex flex-wrap items-center gap-2">
            {!canLoadMore ? <Badge>Current window complete</Badge> : null}
          </div>
        </div>

        <ClientPerfPanel
          expandedGroupCount={openGroupDates.length}
          totalGroupCount={groups.length}
          visibleLogCount={visibleLogs.length}
        />

        {groups.length > 0 ? (
          <div className="space-y-3">
            {groups.map((group, index) => (
              <details
                className="group border-b border-border open:border-b-0"
                key={group.date}
                onToggle={(event) => toggleGroup(group.date, event.currentTarget.open)}
                open={
                  openGroupDates.includes(group.date) ||
                  (index === 0 && openGroupDates.length === 0)
                }
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "128px"
                }}
              >
                <summary className="cursor-pointer list-none py-3 [&::-webkit-details-marker]:hidden">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div>
                        <div className="flex items-start justify-between gap-3 sm:block">
                          <div>
                            <ItemTitle>{formatDayDate(group.date)}</ItemTitle>
                          </div>

                          <div className="flex items-center justify-end gap-2 text-right sm:hidden">
                            <p className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.04em] text-card-foreground">
                              {group.wins}-{group.losses}
                            </p>
                            <ChevronIcon className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="hidden items-center self-center lg:flex lg:gap-2.5">
                      <div className="text-right">
                        <p className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.04em] text-card-foreground">
                          {group.wins}-{group.losses}
                        </p>
                      </div>
                      <ChevronIcon className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                    </div>
                  </div>
                </summary>

                {openGroupDates.includes(group.date) ? (
                  <div className="flex flex-col gap-2">
                    {group.logs.map((log) => (
                      <LogRow
                        editAction={
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditingLog(toEditableLog(log));
                              setEditRequestId((currentId) => currentId + 1);
                            }}
                          >
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                        }
                        key={log.id}
                        log={log}
                        managementMode={managementModeActive}
                        onCancelWarmDetailAssets={() => cancelDetailRouteWarm(log.id)}
                        onDelete={() => handleDeleteSingle(log.id)}
                        onWarmDetailAssets={() => scheduleDetailRouteWarm(log.id)}
                        onToggleSelected={() => toggleSelectedLog(log.id)}
                        selected={selectedLogIdSet.has(log.id)}
                        variant="flat"
                      />
                    ))}
                  </div>
                ) : null}
              </details>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted p-6 text-sm text-muted-foreground">
            {canLoadMore
              ? "No logs appear in the currently loaded 7-day window yet. Load more logs to keep going further back."
              : "No battle logs yet. Import your first PTCGL log to start tracking results."}
          </div>
        )}

        {canLoadMore ? (
          <div
            className={`flex flex-wrap items-center gap-3 pt-4 ${
              loadMoreError ? "justify-between" : "justify-end"
            }`}
          >
            {loadMoreError ? (
              <p className="text-sm font-medium text-loss-strong">{loadMoreError}</p>
            ) : null}
            <Button
              disabled={isLoadingMore || isMutating}
              onClick={handleLoadMore}
              variant="outline"
            >
              {isLoadingMore ? "Loading Older Logs..." : "Load More Logs"}
            </Button>
          </div>
        ) : null}
      </div>

      {managementModeActive ? (
        <DynamicLogsManagementDock
          allSelected={allSelected}
          canApplyDeckList={canApplyDeckList}
          canDeleteSelected={canDeleteSelected}
          deckOptionsError={deckOptionsError}
          isLoadingDeckOptions={isLoadingDeckOptions}
          isMutating={isMutating}
          onApplyDeckList={handleApplyDeckList}
          onDeleteSelected={handleDeleteSelected}
          onSelectDeck={handleDeckChange}
          onSelectDeckList={handleDeckListChange}
          onToggleSelectAll={toggleSelectAll}
          selectedCount={selectedCount}
          selectedDeckId={selectedDeckId}
          selectedDeckListSelectionKey={selectedDeckListSelectionKey}
          userDeckLists={userDeckLists}
          userDecks={userDecks}
          visibleLogCount={visibleLogs.length}
        />
      ) : null}

      {editingLog ? (
        <DynamicLazyEditLogButton
          autoOpen
          key={`${editingLog.id}-${editRequestId}`}
          log={editingLog}
          userDecks={userDecks}
          userDeckLists={userDeckLists}
        />
      ) : null}
    </div>
  );
}
