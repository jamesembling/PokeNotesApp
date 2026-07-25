"use client";

import Link from "next/link";
import { memo, type CSSProperties, type ReactNode } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Checkbox } from "@/components/shadcn/checkbox";
import { ChevronIcon, TrashIcon } from "@/components/ui/icons";
import {
  focusRolloverClassName,
  logEntryRolloverClassName
} from "@/components/ui/rolloverStyles";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/shadcn/dropdown-menu";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/deck-display";
import { formatDayDate } from "@/lib/client/date-format";
import type { BattleLogSummary, PokemonOption } from "@/types/index";

type LogRowProps = {
  editAction?: ReactNode;
  log: BattleLogSummary;
  managementMode?: boolean;
  onCancelWarmDetailAssets?: () => void;
  onDelete?: () => void;
  onWarmDetailAssets?: () => void;
  onToggleSelected?: () => void;
  pokemonOptions?: PokemonOption[] | null;
  selected?: boolean;
  variant?: "card" | "flat";
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
  onCancelWarmDetailAssets,
  onDelete,
  onWarmDetailAssets,
  onToggleSelected,
  pokemonOptions,
  selected = false,
  variant = "card"
}: LogRowProps) {
  const toneClasses =
    log.result === "Win"
      ? "border-win-border bg-win-bg"
      : "border-loss-border bg-loss-bg";
  const flatToneClasses =
    log.result === "Win"
      ? "bg-win-bg"
      : "bg-loss-bg";

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
    variant === "flat"
      ? "group relative grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1.5 overflow-hidden rounded-[10px] border border-border p-3 text-left sm:grid-cols-[4.25rem_minmax(0,1fr)_3.5rem_4.25rem_1.25rem] sm:gap-3 sm:px-4 sm:py-4 lg:grid-cols-[5rem_minmax(0,1fr)_4rem_5rem_1.25rem] lg:gap-4 lg:px-5"
      : "group relative grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1.5 overflow-hidden rounded-[10px] border p-3 text-left sm:grid-cols-[4.25rem_minmax(0,1fr)_3.5rem_4.25rem_1.25rem] sm:gap-3 sm:px-4 sm:py-4 lg:grid-cols-[5rem_minmax(0,1fr)_4rem_5rem_1.25rem] lg:gap-4 lg:px-5",
    logEntryRolloverClassName,
    focusRolloverClassName,
    managementMode && selected ? "ring-2 ring-inset ring-ring/45" : "",
    variant === "flat" ? flatToneClasses : toneClasses
  ].join(" ");
  const managementRowClasses = [
    variant === "flat"
      ? "group/row grid overflow-hidden rounded-[10px] border border-border text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch"
      : "group/row grid overflow-hidden rounded-[10px] border text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch",
    logEntryRolloverClassName,
    selected ? "ring-2 ring-inset ring-ring/45" : "",
    variant === "flat" ? flatToneClasses : toneClasses
  ].join(" ");
  const managementLinkClasses =
    "grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1.5 p-3 text-left outline-none sm:grid-cols-[4.25rem_minmax(0,1fr)_3.5rem_4.25rem] sm:gap-3 sm:px-4 sm:py-4 lg:grid-cols-[5rem_minmax(0,1fr)_4rem_5rem] lg:gap-4 lg:px-5";

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
        <p className="block truncate text-[0.86rem] font-semibold leading-[1.15] tracking-[-0.015em] text-card-foreground sm:whitespace-normal sm:text-[1.06rem] sm:leading-[1.25] sm:truncate">
          {log.result} vs {opponentDeckName}
          {log.opponentPlayerName ? (
            <span className="hidden font-normal sm:inline"> ({log.opponentPlayerName})</span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-[0.8rem] leading-4 text-muted-foreground sm:mt-1 sm:text-base sm:leading-6">
          <span className="sm:hidden">{mobileMetadata}</span>
          <span className="hidden sm:inline">{metadata}</span>
        </p>
      </div>

      <div className="hidden w-full text-center text-[0.95rem] font-semibold text-muted-foreground sm:block sm:text-[1rem]">
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

      {!managementMode ? (
        <ChevronIcon className="hidden size-4 -rotate-90 justify-self-end text-muted-foreground sm:block" />
      ) : null}
    </>
  );

  if (!managementMode) {
    return (
      <Link
        className={cardClasses}
        href={`/logs/${log.id}`}
        onBlur={onCancelWarmDetailAssets}
        onFocus={onWarmDetailAssets}
        onPointerEnter={onWarmDetailAssets}
        onPointerLeave={onCancelWarmDetailAssets}
        prefetch={false}
        style={cardStyle}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={managementRowClasses}
      style={cardStyle}
    >
      <Link
        className={managementLinkClasses}
        href={`/logs/${log.id}`}
        onBlur={onCancelWarmDetailAssets}
        onFocus={onWarmDetailAssets}
        onPointerEnter={onWarmDetailAssets}
        onPointerLeave={onCancelWarmDetailAssets}
        prefetch={false}
      >
        {content}
      </Link>

      <div className="flex items-center justify-end gap-1 border-t border-current/10 bg-card/70 px-1.5 py-1 text-muted-foreground sm:border-l sm:border-t-0 sm:bg-card/60">
        <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold text-card-foreground sm:min-h-0 sm:p-2">
          <span className="sr-only">Select battle log</span>
          <Checkbox
            checked={selected}
            className="size-5 cursor-pointer rounded border-border bg-card"
            onCheckedChange={onToggleSelected}
          />
          <span className="sm:hidden">{selected ? "Selected" : "Select"}</span>
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Open battle log actions"
              className="text-muted-foreground hover:text-card-foreground"
              size="icon-lg"
              variant="outline"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40" forceMount>
            {editAction ? <DropdownMenuGroup>{editAction}</DropdownMenuGroup> : null}
            {editAction ? <DropdownMenuSeparator /> : null}
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="text-loss-strong focus:text-loss-strong"
                onClick={onDelete}
                variant="destructive"
              >
                <TrashIcon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export const LogRow = memo(LogRowComponent);
