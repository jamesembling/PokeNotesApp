"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  bulkAssignDeckListAction,
  deleteLogAction,
  deleteLogsAction,
  loadMoreLogsAction
} from "@/app/(app)/logs/actions";
import { MoreHorizontalIcon } from "lucide-react";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { AppSelect } from "@/components/shadcn/app-select";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { ClientPerfPanel } from "@/components/ui/ClientPerfPanel";
import { DeleteConfirmDialog } from "@/components/ui/DeleteConfirmDialog";
import { ChevronIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/shadcn/dropdown-menu";
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
  renderHeaderAction?: (action: ReactNode) => ReactNode;
};

type DeckSelectionOptionsResponse = {
  userDecks?: DeckSelectionOption[];
};

let battleLogDetailAssetsWarmed = false;
const warmedBattleLogDetailRoutes = new Set<string>();

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

function warmBattleLogDetailRoute(router: ReturnType<typeof useRouter>, logId: string) {
  warmBattleLogDetailAssets();

  const href = `/logs/${logId}`;
  if (warmedBattleLogDetailRoutes.has(href)) {
    return;
  }

  warmedBattleLogDetailRoutes.add(href);
  router.prefetch(href);
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
  const deckListNamesByKey = new Map<string, string>();

  userDecks.forEach((deck) => {
    deck.deckLists.forEach((deckList) => {
      deckListNamesByKey.set(`${deck.id}:${deckList.id}`, deckList.name);
    });
  });

  return logs.map((log) => {
    if (!log.linkedDeckId || !log.linkedDeckListId) {
      return {
        ...log,
        linkedDeckListName: undefined
      };
    }

    return {
      ...log,
      linkedDeckListName: deckListNamesByKey.get(`${log.linkedDeckId}:${log.linkedDeckListId}`)
    };
  });
}

export function LogsManager({
  initialCanLoadMore,
  initialLogs,
  initialNextWindowEndDate,
  initialWindowEndDate,
  initialWindowStartDate,
  initialUserDecks = [],
  renderHeaderAction
}: LogsManagerProps) {
  const router = useRouter();
  const [isMutating, startMutationTransition] = useTransition();
  const [isLoadingMore, startLoadMoreTransition] = useTransition();
  const [isManagementMode, setIsManagementMode] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedDeckListId, setSelectedDeckListId] = useState("");
  const [visibleLogs, setVisibleLogs] = useState(() =>
    initialUserDecks.length > 0
      ? attachLinkedDeckListNames(initialLogs, initialUserDecks)
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
    nextWindowEndDateRef.current = initialNextWindowEndDate;
    windowStartDateRef.current = initialWindowStartDate;
    windowEndDateRef.current = initialWindowEndDate;
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

  const editLogsButton = (
    <Button
      className="w-full justify-center sm:w-auto sm:self-start sm:min-w-[5.5rem]"
      onClick={toggleManagementMode}
    >
      {managementModeActive ? "Done" : "Edit logs"}
    </Button>
  );

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
        const result = await loadMoreLogsAction(nextWindowEndDateRef.current);
        const nextLogs = attachLinkedDeckListNames(result.logs, userDecks);

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
    <div className={`flex flex-col ${managementModeActive ? "pb-36 md:pb-20" : ""}`}>
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
        <Alert
          aria-live="polite"
          className="border-loss-border bg-loss-bg text-loss"
          variant="destructive"
        >
          <AlertTitle className="ui-eyebrow">Action Failed</AlertTitle>
          <AlertDescription>{actionNotice.message}</AlertDescription>
        </Alert>
      ) : null}

      {renderHeaderAction?.(editLogsButton)}

      <div className="flex flex-col gap-6 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:hidden">
          <div className="flex flex-wrap items-center gap-2">
            {!canLoadMore ? <Badge>Current window complete</Badge> : null}
          </div>

          <LazyImportLogButton className="w-full justify-center" initialUserDecks={userDecks} />
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
                open={openGroupDates.includes(group.date) || (index === 0 && openGroupDates.length === 0)}
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
                            <h3 className="font-display text-[1.08rem] font-semibold tracking-[-0.025em] text-card-foreground">
                              {formatDayDate(group.date)}
                            </h3>
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
                        onDelete={() => handleDeleteSingle(log.id)}
                        onWarmDetailAssets={() => warmBattleLogDetailRoute(router, log.id)}
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
              <p className="text-sm font-medium text-loss">{loadMoreError}</p>
            ) : null}
            <Button disabled={isLoadingMore} onClick={handleLoadMore} variant="outline">
              {isLoadingMore ? "Loading Older Logs..." : "Load More Logs"}
            </Button>
          </div>
        ) : null}
      </div>

      {managementModeActive ? (
        <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-6">
          <Card
            className="mx-auto grid max-w-6xl gap-3 bg-popover p-3 shadow-[var(--shadow-lg)] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
            size="sm"
          >
            <div className="flex items-center justify-between gap-3 md:justify-start">
              <div className="min-w-[5.5rem]">
                <p className="ui-eyebrow">Selected</p>
                <p className="mt-0.5 font-display text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-card-foreground">
                  {selectedCount}
                  <span className="ml-1 text-sm font-medium tracking-normal text-muted-foreground">
                    / {visibleLogs.length}
                  </span>
                </p>
              </div>

              {visibleLogs.length > 0 ? (
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-card-foreground">
                  <Checkbox
                    checked={allSelected}
                    className="cursor-pointer rounded border-border bg-card"
                    onCheckedChange={toggleSelectAll}
                  />
                  <span>{allSelected ? "Clear" : "All"}</span>
                </label>
              ) : null}
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {deckOptionsError ? (
                <p className="text-sm font-medium text-loss md:col-span-2">
                  {deckOptionsError}
                </p>
              ) : null}
              <AppSelect
                aria-label="Deck strategy for selected logs"
                className="min-h-[2.5rem] bg-background px-3 py-2"
                onChange={setSelectedDeckId}
                options={[
                  {
                    label: isLoadingDeckOptions ? "Loading deck strategies..." : "Deck strategy",
                    value: ""
                  },
                  ...userDecks.map((deck) => ({
                    label: deck.deckName,
                    value: deck.id
                  }))
                ]}
                value={selectedDeckId}
              />

              <AppSelect
                aria-label="Deck list for selected logs"
                className="min-h-[2.5rem] bg-background px-3 py-2"
                disabled={!selectedDeck || availableDeckLists.length === 0}
                onChange={setSelectedDeckListId}
                options={[
                  {
                    label: selectedDeck
                      ? availableDeckLists.length > 0
                        ? "Deck list"
                        : "No saved deck lists"
                      : "Choose strategy first",
                    value: ""
                  },
                  ...availableDeckLists.map((deckList) => ({
                    label: deckList.name,
                    value: deckList.id
                  }))
                ]}
                value={selectedDeckListId}
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2 md:flex md:justify-end">
              <Button disabled={!canApplyDeckList} onClick={handleApplyDeckList}>
                {isMutating ? "Applying..." : "Apply"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Open selected log actions"
                    disabled={!canDeleteSelected}
                    size="icon-lg"
                    variant="outline"
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44" forceMount>
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      className="text-loss focus:text-loss"
                      onClick={handleDeleteSelected}
                      variant="destructive"
                    >
                      <TrashIcon />
                      Delete selected
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        </div>
      ) : null}

      {editingLog ? (
        <LazyEditLogButton
          autoOpen
          key={`${editingLog.id}-${editRequestId}`}
          log={editingLog}
          userDecks={userDecks}
        />
      ) : null}
    </div>
  );
}
