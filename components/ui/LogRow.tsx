"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { TrashIcon } from "@/components/ui/icons";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import type { BattleLogSummary } from "@/types/index";

type LogRowProps = {
  editAction?: ReactNode;
  log: BattleLogSummary;
  managementMode?: boolean;
  onDelete?: () => void;
  onToggleSelected?: () => void;
  selected?: boolean;
};

function formatLogDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function formatGoOrder(goOrder: BattleLogSummary["goOrder"]) {
  if (goOrder === "First") {
    return "1st";
  }

  if (goOrder === "Second") {
    return "2nd";
  }

  return null;
}

export function LogRow({
  editAction,
  log,
  managementMode = false,
  onDelete,
  onToggleSelected,
  selected = false
}: LogRowProps) {
  const rowClasses =
    log.result === "Win"
      ? "border-[var(--color-win-border)] bg-[var(--color-win-bg)]"
      : "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)]";

  const selfSprites = log.selfDeckSprites.slice(0, 2);
  const opponentDeckName = getBattleLogDeckDisplayName(
    log.opponentDeckName,
    log.opponentDeckSprites
  );
  const goOrderLabel = formatGoOrder(log.goOrder);
  const metadata = [formatLogDate(log.date), log.linkedDeckListName ? `List: ${log.linkedDeckListName}` : ""]
    .filter(Boolean)
    .join(" · ");

  const cardClasses = [
    "grid w-full grid-cols-1 gap-3 rounded-[22px] border px-4 py-4 text-left transition hover:brightness-[0.98] sm:grid-cols-[4.25rem_minmax(0,1fr)_3.5rem_4.25rem] sm:items-center sm:gap-3 sm:rounded-[24px] sm:px-4 lg:grid-cols-[5.5rem_minmax(0,1fr)_4rem_5.5rem] lg:gap-5 lg:px-6",
    rowClasses
  ].join(" ");

  const content = (
    <>
      <div className="hidden min-w-0 items-center justify-start sm:flex">
        <SpriteStrip className="-space-x-2 gap-0" size="md" sprites={selfSprites} />
      </div>

      <div className="min-w-0 text-left">
        <p className="block whitespace-normal text-[1.08rem] font-semibold leading-[1.2] tracking-[-0.015em] text-[var(--text-primary)] sm:truncate">
          {log.result} vs {opponentDeckName}
        </p>
        <p className="mt-1 text-[0.94rem] leading-[1.25] text-[var(--text-muted)]">
          {metadata}
        </p>
      </div>

      <div className="w-full text-left text-[0.95rem] font-semibold text-[var(--text-muted)] sm:text-center sm:text-[1rem]">
        {goOrderLabel ?? ""}
      </div>

      <div className="hidden min-w-0 items-center justify-end sm:flex">
        <SpriteStrip className="-space-x-2 gap-0" size="md" sprites={log.opponentDeckSprites} />
      </div>
    </>
  );

  if (!managementMode) {
    return (
      <Link className={cardClasses} href={`/logs/${log.id}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <Link className={cardClasses} href={`/logs/${log.id}`}>
        {content}
      </Link>

      <div className="flex items-center justify-end gap-1 text-[var(--text-muted)]">
        <label className="inline-flex cursor-pointer items-center justify-center p-2">
          <span className="sr-only">Select battle log</span>
          <input
            checked={selected}
            className="h-5 w-5 cursor-pointer rounded border-[var(--border)] bg-[var(--bg-surface)]"
            onChange={onToggleSelected}
            type="checkbox"
          />
        </label>

        {editAction}

        <button
          aria-label="Delete battle log"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--color-loss-strong)]"
          onClick={onDelete}
          type="button"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
