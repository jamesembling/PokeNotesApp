import type { ReactNode } from "react";
import { TrophyIcon } from "@phosphor-icons/react";
import type {
  BattleLogActionTagOverrides,
  BattleLogResolvedActionTag
} from "@/lib/battle-log/action-tags";
import { Card } from "@/components/shadcn/card";
import { MatchSummary } from "@/components/ui/MatchSummary";
import {
  classifyBattleLogActionTitle,
  formatBattleLogActionDetail,
  formatBattleLogActionTitle,
  getBattleLogActionTagLabel,
  type BattleLogActionTag
} from "@/lib/battle-log/display";
import type { BattleLog, LogSection } from "@/types/index";

const SETUP_SECTION_LABELS = new Set(["setup"]);

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 transition group-open:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const actionTagToneClassNames: Record<BattleLogActionTag, string> = {
  draw:
    "border-[rgba(100,116,139,0.18)] bg-[rgba(100,116,139,0.08)] text-[rgb(71,85,105)]",
  bench:
    "border-[rgba(148,163,184,0.2)] bg-[rgba(148,163,184,0.08)] text-[rgb(100,116,139)]",
  evolve:
    "border-[rgba(217,70,239,0.18)] bg-[rgba(217,70,239,0.08)] text-[rgb(190,24,93)]",
  ability:
    "border-[rgba(124,58,237,0.18)] bg-[rgba(124,58,237,0.08)] text-[rgb(109,40,217)]",
  supporter:
    "border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.1)] text-[rgb(21,128,61)]",
  item:
    "border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.08)] text-[rgb(29,78,216)]",
  tool:
    "border-[rgba(8,145,178,0.18)] bg-[rgba(8,145,178,0.08)] text-[rgb(14,116,144)]",
  stadium:
    "border-[rgba(234,88,12,0.2)] bg-[rgba(234,88,12,0.1)] text-[rgb(194,65,12)]",
  win: "border-[rgba(5,150,105,0.2)] bg-[rgba(5,150,105,0.1)] text-[rgb(6,95,70)]",
  loss: "border-[rgba(190,24,93,0.18)] bg-[rgba(190,24,93,0.1)] text-[rgb(157,23,77)]",
  attack:
    "border-[rgba(220,38,38,0.18)] bg-[rgba(220,38,38,0.1)] text-[rgb(185,28,28)]",
  ko: "border-[rgba(244,63,94,0.18)] bg-[rgba(244,63,94,0.1)] text-[rgb(190,24,93)]",
  other:
    "border-border bg-muted text-muted-foreground"
};

function ActionTag({
  resolved,
  title
}: {
  resolved?: BattleLogResolvedActionTag;
  title: string;
}) {
  const tag = resolved?.tag ?? classifyBattleLogActionTitle(title);
  const label = resolved?.label ?? getBattleLogActionTagLabel(title);

  return (
    <span
      className={[
        "inline-flex h-6 w-fit shrink-0 items-center whitespace-nowrap rounded-[8px] border px-2 text-[0.58rem] font-semibold uppercase leading-none tracking-[0.12em] sm:w-[5.35rem] sm:justify-center",
        actionTagToneClassNames[tag]
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function ActionRow({
  children,
  resolved,
  title
}: {
  children: ReactNode;
  resolved?: BattleLogResolvedActionTag;
  title: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:grid sm:grid-cols-[5.35rem_minmax(0,1fr)] sm:items-start sm:gap-3">
      <ActionTag resolved={resolved} title={title} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function renderIndentedLine(text: string, level = 1, keyValue?: string) {
  return (
    <div
      className={level === 1 ? "pl-5" : "ml-6 border-l border-border pl-6"}
      key={keyValue}
    >
      <p className="m-0 flex items-start gap-3">
        <span className="text-muted-foreground">{level === 1 ? "•" : "◦"}</span>
        <span>{text}</span>
      </p>
    </div>
  );
}

function hasDamageDetail(details: string[]) {
  return details.some((detail) => /\b(?:for|took)\s+\d+\+?\s+damage\b/i.test(String(detail || "")));
}

function hasPossessivePokemonUsedAction(actionTitle: string) {
  return /^[A-Za-z0-9_.-]+'s\s+.+\s+used\b/i.test(String(actionTitle || "").trim());
}

function getDisplayActionTag(
  actionTitle: string,
  details: string[],
  resolvedActionTag?: BattleLogResolvedActionTag
): BattleLogActionTag {
  const classifiedActionTag = resolvedActionTag?.tag ?? classifyBattleLogActionTitle(actionTitle);

  if (
    classifiedActionTag === "ability" &&
    (hasDamageDetail(details) || hasPossessivePokemonUsedAction(actionTitle))
  ) {
    return "attack";
  }

  return classifiedActionTag;
}

function getDisplayActionTagOverride(
  actionTitle: string,
  details: string[],
  resolvedActionTag?: BattleLogResolvedActionTag
): BattleLogResolvedActionTag | undefined {
  const displayActionTag = getDisplayActionTag(actionTitle, details, resolvedActionTag);

  if (displayActionTag === "attack" && resolvedActionTag?.tag !== "attack") {
    return {
      label: "Attack",
      tag: "attack"
    };
  }

  return resolvedActionTag;
}

function renderBattleLogActionDetails(details: string[], actionTag: BattleLogActionTag) {
  const chunks: ReactNode[] = [];
  let bullets: string[] = [];
  let chunkIndex = 0;

  function renderNestedBulletGroup(items: string[], groupIndex: number) {
    if (!items.length) {
      return null;
    }

    const first = String(items[0] || "").trim();
    const rest = items.slice(1).map((item) => String(item || "").trim()).filter(Boolean);
    const supportsNestedCards =
      /\b\d+\s+drawn cards?\.?$/i.test(first) || /\b\d+\s+cards? drawn\.?$/i.test(first);

    if (supportsNestedCards && rest.length > 0) {
      return (
        <div className="grid gap-2" key={`group-${groupIndex}`}>
          {renderIndentedLine(first, 1)}
          <div className="grid gap-1">
            {rest.map((item, index) =>
              renderIndentedLine(item, 2, `group-${groupIndex}-nested-${index}`)
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-2" key={`group-${groupIndex}`}>
        {items.map((item, index) =>
          renderIndentedLine(item, 1, `group-${groupIndex}-item-${index}`)
        )}
      </div>
    );
  }

  function flushBullets() {
    if (!bullets.length) {
      return;
    }

    chunks.push(renderNestedBulletGroup(bullets, chunkIndex));
    chunkIndex += 1;
    bullets = [];
  }

  details.forEach((detail) => {
    const value = formatBattleLogActionDetail(detail, { actionTag });
    if (!value) {
      return;
    }

    const bulletMatch = value.match(/^[-•]\s*(.+)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1]);
      return;
    }

    flushBullets();
    chunks.push(
      <p className="m-0" key={`detail-${chunkIndex}`}>
        {value}
      </p>
    );
    chunkIndex += 1;
  });

  flushBullets();
  return chunks;
}

function getOrderedPlayerNames(
  section: LogSection,
  previousSection: LogSection | null,
  selfPlayerName: string
) {
  const sectionPlayerNames = Object.keys(section.prizesAfterTurn ?? {});
  const previousPlayerNames = Object.keys(previousSection?.prizesAfterTurn ?? {});
  return Array.from(
    new Set([selfPlayerName, ...sectionPlayerNames, ...previousPlayerNames].filter(Boolean))
  );
}

function getPlayerToneClassNames(playerName: string, selfPlayerName: string) {
  return playerName === selfPlayerName
    ? {
        dot: "bg-[rgb(59,130,246)]",
        name: "text-[rgb(37,99,235)] dark:text-[rgb(96,165,250)]"
      }
    : {
        dot: "bg-[rgb(236,72,153)]",
        name: "text-[rgb(219,39,119)] dark:text-[rgb(244,114,182)]"
      };
}

function PrizeTracker({
  playerName,
  prizes,
  separated = false,
  selfPlayerName
}: {
  playerName: string;
  prizes: number;
  separated?: boolean;
  selfPlayerName: string;
}) {
  const safePrizes = Math.max(0, Math.min(6, prizes));
  const toneClassNames = getPlayerToneClassNames(playerName, selfPlayerName);

  return (
    <div
      className={[
        "grid min-w-0 grid-cols-[1rem_minmax(0,7.25rem)_4.25rem_1rem] items-center gap-2",
        "sm:w-fit sm:grid-cols-[1rem_auto_4.25rem_1rem] sm:gap-1.5",
        separated ? "sm:border-l sm:border-border sm:pl-3" : ""
      ].join(" ")}
    >
      <TrophyIcon
        aria-hidden="true"
        className={[
          "h-4 w-4 shrink-0",
          toneClassNames.name
        ].join(" ")}
        weight="fill"
      />
      <span
        className={[
          "min-w-0 truncate text-[0.88rem] font-semibold leading-none",
          toneClassNames.name
        ].join(" ")}
        title={playerName}
      >
        {playerName}
      </span>
      <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <span
            className={[
              "h-2 w-2 rounded-full",
              index < safePrizes ? toneClassNames.dot : "bg-slate-300 dark:bg-slate-500/60"
            ].join(" ")}
            key={index}
          />
        ))}
      </span>
      <span className="shrink-0 text-[0.82rem] font-semibold leading-none text-card-foreground">
        {prizes}
      </span>
    </div>
  );
}

function LogSectionCard({
  actionTagOverrides,
  previousSection,
  section,
  selfPlayerName,
  turnNumber
}: {
  actionTagOverrides?: Array<BattleLogResolvedActionTag | null>;
  previousSection: LogSection | null;
  section: LogSection;
  selfPlayerName: string;
  turnNumber: number | null;
}) {
  const isSetupSection = SETUP_SECTION_LABELS.has(String(section.title || "").trim().toLowerCase());
  const effectivePlayer = isSetupSection ? "" : String(section.player || "").trim();
  const bodyToneClassName = !effectivePlayer
    ? "bg-card"
    : effectivePlayer === selfPlayerName
      ? "bg-[rgba(37,99,235,0.045)] dark:bg-[rgba(37,99,235,0.08)]"
      : "bg-[rgba(220,38,38,0.04)] dark:bg-[rgba(220,38,38,0.075)]";
  const headerToneClassName = !effectivePlayer
    ? "bg-muted/55"
    : effectivePlayer === selfPlayerName
      ? "bg-[rgba(37,99,235,0.1)] dark:bg-[rgba(37,99,235,0.16)]"
      : "bg-[rgba(220,38,38,0.08)] dark:bg-[rgba(220,38,38,0.14)]";
  const orderedPlayerNames = getOrderedPlayerNames(section, previousSection, selfPlayerName);
  const actions = section.actions.filter(
    (action) => !SETUP_SECTION_LABELS.has(String(action.title || "").trim().toLowerCase())
  );
  const titleToneClassName = effectivePlayer
    ? getPlayerToneClassNames(effectivePlayer, selfPlayerName).name
    : "text-card-foreground";

  return (
    <article
      className={[
        "overflow-hidden rounded-xl border border-border text-card-foreground",
        bodyToneClassName
      ].join(" ")}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "360px"
      }}
    >
      <div
        className={[
          "border-b border-border px-4 py-4 sm:px-6",
          headerToneClassName
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            className={[
              "min-w-0",
              "font-display m-0 text-[1.05rem] font-semibold",
              titleToneClassName
            ].join(" ")}
          >
            {effectivePlayer ? `${effectivePlayer}'s turn` : section.title}
          </h3>

          {!isSetupSection && turnNumber ? (
            <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-border bg-background/50 px-3 py-1 text-[0.75rem] font-semibold text-muted-foreground">
              Turn {turnNumber}
            </span>
          ) : null}
        </div>

        {orderedPlayerNames.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            {orderedPlayerNames.map((playerName, playerIndex) => {
              const prizes = section.prizesAfterTurn?.[playerName];

              if (typeof prizes !== "number") {
                return null;
              }

              return (
                <PrizeTracker
                  key={playerName}
                  playerName={playerName}
                  prizes={prizes}
                  separated={playerIndex > 0}
                  selfPlayerName={selfPlayerName}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="grid gap-1 px-4 py-4 sm:px-6">
        {actions.map((action, actionIndex) => {
          const resolvedActionTag = actionTagOverrides?.[actionIndex] ?? undefined;
          const displayResolvedActionTag = getDisplayActionTagOverride(
            action.title,
            action.details,
            resolvedActionTag
          );
          const actionTag = getDisplayActionTag(action.title, action.details, displayResolvedActionTag);

          if (action.details.length > 0) {
            return (
              <details
                className="group border-b border-border py-3 last:border-b-0"
                key={`${action.title}-${actionIndex}`}
              >
                <summary className="cursor-pointer list-none px-1 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-start justify-between gap-4">
                    <ActionRow resolved={displayResolvedActionTag} title={action.title}>
                      <div className="text-[0.98rem] leading-7 text-card-foreground">
                        {formatBattleLogActionTitle(action.title, {
                          actionTag,
                          retainActor: isSetupSection
                        })}
                      </div>
                    </ActionRow>
                    <span className="pt-1 text-muted-foreground">
                      <ChevronIcon />
                    </span>
                  </div>
                </summary>
                <div className="mt-2 grid gap-2 px-1 sm:grid-cols-[5.35rem_minmax(0,1fr)] sm:gap-3">
                  <div className="hidden sm:block" />
                  <div className="grid gap-2 text-[0.92rem] leading-6 text-muted-foreground">
                    {renderBattleLogActionDetails(action.details, actionTag)}
                  </div>
                </div>
              </details>
            );
          }

          return (
            <div
              className="border-b border-border px-1 py-3 text-[1rem] leading-7 text-card-foreground last:border-b-0"
              key={`${action.title}-${actionIndex}`}
            >
              <ActionRow resolved={displayResolvedActionTag} title={action.title}>
                <div className="text-[0.98rem] leading-7 text-card-foreground">
                  {formatBattleLogActionTitle(action.title, {
                    actionTag,
                    retainActor: isSetupSection
                  })}
                </div>
              </ActionRow>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function getSectionTurnNumbers(sections: LogSection[]) {
  const turnNumbers: Array<number | null> = [];
  const turnsByPlayer = new Map<string, number>();

  sections.forEach((section, index) => {
    const isSetupSection = SETUP_SECTION_LABELS.has(String(section.title || "").trim().toLowerCase());
    if (isSetupSection) {
      turnNumbers[index] = null;
      return;
    }

    const playerKey = String(section.player || "").trim();
    const nextTurnNumber = (turnsByPlayer.get(playerKey) || 0) + 1;
    turnsByPlayer.set(playerKey, nextTurnNumber);
    turnNumbers[index] = nextTurnNumber;
  });

  return turnNumbers;
}

type BattleLogDetailViewProps = {
  actionTagOverrides?: BattleLogActionTagOverrides;
  actions?: ReactNode;
  footerAction?: ReactNode;
  linkedStrategyLabel: string;
  isBodyLoading?: boolean;
  log: BattleLog;
  mobileNavigation?: ReactNode;
  notice?: ReactNode;
  timestampLabel: string;
};

export function BattleLogDetailView({
  actionTagOverrides,
  actions,
  footerAction,
  linkedStrategyLabel: _linkedStrategyLabel,
  isBodyLoading = false,
  log,
  mobileNavigation,
  notice,
  timestampLabel
}: BattleLogDetailViewProps) {
  void _linkedStrategyLabel;
  const sections = Array.isArray(log.sections) ? log.sections : [];
  const turnNumbers = getSectionTurnNumbers(sections);

  return (
    <>
      {mobileNavigation ? <div className="mb-0 sm:hidden">{mobileNavigation}</div> : null}

      <MatchSummary actions={actions} log={log} timestampLabel={timestampLabel} />

      {notice ? <div>{notice}</div> : null}

      {sections.length > 0 ? (
        sections.map((section, index) => (
          <LogSectionCard
            actionTagOverrides={actionTagOverrides?.[index]}
            key={`${section.title}-${index}`}
            previousSection={index > 0 ? sections[index - 1] : null}
            section={section}
            selfPlayerName={log.selfPlayerName}
            turnNumber={turnNumbers[index] ?? null}
          />
        ))
      ) : isBodyLoading ? (
        <Card>
          <div className="flex flex-col gap-3" role="status">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-11/12 rounded bg-muted" />
            <div className="h-3 w-4/5 rounded bg-muted" />
          </div>
        </Card>
      ) : (
        <Card>
          <div className="whitespace-pre-wrap font-mono text-[0.92rem] leading-6 text-card-foreground">
            {log.rawLog || "No parsed battle log stored for this record."}
          </div>
        </Card>
      )}

      {footerAction ? <div>{footerAction}</div> : null}
    </>
  );
}
