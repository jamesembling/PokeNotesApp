"use client";

import Link from "next/link";
import { memo, type CSSProperties, type ReactNode } from "react";
import { TrashIcon } from "@/components/ui/icons";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import { formatDayDate } from "@/lib/client/date-format";
import type { BattleLogSummary, PokemonOption } from "@/types/index";

type LogRowProps = {
  editAction?: ReactNode;
  log: BattleLogSummary;
  managementMode?: boolean;
  onDelete?: () => void;
  onToggleSelected?: () => void;
  pokemonOptions?: PokemonOption[] | null;
  selected?: boolean;
};

function formatGoOrder(goOrder: BattleLogSummary["goOrder"]) {
  if (goOrder === "First") {
    return "1st";
  }

  if (goOrder === "Second") {
    return "2nd";
  }

  return null;
}

const cardStyle: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "96px"
};

function LogRowComponent({
  editAction,
  log,
  managementMode = false,
  onDelete,
  onToggleSelected,
  pokemonOptions,
  selected = false
}: LogRowProps) {
  const rowClasses =
    log.result === "Win"
      ? "border-[var(--color-win-border)] bg-[var(--color-win-bg)]"
      : "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)]";

  const selfSprites = log.selfDeckSprites.slice(0, 2);
  const opponentDeckName = getBattleLogOpponentDisplayName(
    log.opponentDeckName,
    log.opponentDeckSprites
  );
  const goOrderLabel = formatGoOrder(log.goOrder);
  const metadata = [formatDayDate(log.date), log.linkedDeckListName ? `List: ${log.linkedDeckListName}` : ""]
    .filter(Boolean)
    .join(" · ");
  const mobileMetadata = formatDayDate(log.date);

  const cardClasses = [
    "group relative grid w-full grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 overflow-hidden rounded-[10px] border px-3 py-3 text-left transition duration-200 hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] sm:grid-cols-[4.25rem_minmax(0,1fr)_3.5rem_4.25rem] sm:gap-3 sm:px-4 sm:py-4 lg:grid-cols-[5rem_minmax(0,1fr)_4rem_5rem] lg:gap-4 lg:px-5 lg:hover:-translate-y-0.5 lg:hover:shadow-[var(--shadow-sm)]",
    rowClasses
  ].join(" ");

  const content = (
    <>
      <div className="flex min-w-0 items-center justify-start sm:hidden">
        <SpriteStrip
          className="-space-x-1 gap-0"
          maxVisible={2}
          pokemonOptions={pokemonOptions}
          size="xs"
          sprites={selfSprites}
        />
      </div>

      <div className="hidden min-w-0 items-center justify-start sm:flex">
        <SpriteStrip
          className="-space-x-2 gap-0"
          pokemonOptions={pokemonOptions}
          size="lg"
          sprites={selfSprites}
        />
      </div>

      <div className="min-w-0 text-center sm:text-left">
        <p className="block truncate text-[0.92rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--text-primary)] sm:whitespace-normal sm:text-[1.06rem] sm:leading-[1.25] sm:truncate">
          {log.result} vs {opponentDeckName}
          {log.opponentPlayerName ? (
            <span className="hidden font-normal sm:inline"> ({log.opponentPlayerName})</span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-[0.8rem] leading-4 text-[var(--text-muted)] sm:mt-1 sm:text-base sm:leading-6">
          <span className="sm:hidden">{mobileMetadata}</span>
          <span className="hidden sm:inline">{metadata}</span>
        </p>
      </div>

      <div className="hidden w-full text-center text-[0.95rem] font-semibold text-[var(--text-muted)] sm:block sm:text-[1rem]">
        {goOrderLabel ?? ""}
      </div>

      <div className="flex min-w-0 items-center justify-end sm:hidden">
        <SpriteStrip
          className="-space-x-1 gap-0"
          maxVisible={2}
          pokemonOptions={pokemonOptions}
          size="xs"
          sprites={log.opponentDeckSprites}
        />
      </div>

      <div className="hidden min-w-0 items-center justify-end sm:flex">
        <SpriteStrip
          className="-space-x-2 gap-0"
          pokemonOptions={pokemonOptions}
          size="lg"
          sprites={log.opponentDeckSprites}
        />
      </div>
    </>
  );

  if (!managementMode) {
    return (
      <Link className={cardClasses} href={`/logs/${log.id}`} style={cardStyle}>
        {content}
      </Link>
    );
  }

  return (
    <div className="group/row grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" style={cardStyle}>
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

export const LogRow = memo(LogRowComponent);
