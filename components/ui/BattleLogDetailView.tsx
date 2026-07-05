import type { ReactNode } from "react";
import { ArrowRightIcon, CalculatorIcon, CopyIcon, ShuffleIcon, XIcon } from "lucide-react";
import type {
  BattleLogActionTagOverrides,
  BattleLogResolvedActionTag
} from "@/lib/battle-log/action-tags";
import {
  getBattleLogDamageBreakdown,
  getBattleLogDetailEvent,
  getAddedToHandDetailCard,
  getDisplayActionTag,
  getDisplayActionTagOverride,
  isCardListDetail,
  type DamageBreakdown,
  type DetailEvent
} from "@/lib/battle-log/detail-display";
import { Card } from "@/components/shadcn/card";
import { MatchSummary } from "@/components/ui/MatchSummary";
import {
  classifyBattleLogActionTitle,
  formatBattleLogActionDetail,
  formatBattleLogActionTitle,
  getBattleLogDisplayActionDetails,
  getBattleLogDisplayActionTitle,
  getBattleLogActionTagLabel,
  type BattleLogActionTag
} from "@/lib/battle-log/display";
import type { BattleLog, LogSection } from "@/types/index";
import { compactMap } from "@/lib/array";

const SETUP_SECTION_LABELS = new Set(["setup"]);

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 transition group-open:rotate-180"
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

function PrizeTrophyIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M7 4.5h10v2h3a1 1 0 0 1 1 1v1.2a5 5 0 0 1-4.25 4.95 5 5 0 0 1-3.25 2.2V18h2.25a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h2.25v-2.15a5 5 0 0 1-3.25-2.2A5 5 0 0 1 3 8.7V7.5a1 1 0 0 1 1-1h3v-2Zm0 3.5H4.5v.7A3.5 3.5 0 0 0 7 12.05V8Zm10 4.05a3.5 3.5 0 0 0 2.5-3.35V8H17v4.05Z" />
    </svg>
  );
}

const actionTagDotClassNames: Record<BattleLogActionTag, string> = {
  draw: "bg-[rgb(37,99,235)]",
  bench: "bg-[rgb(16,185,129)]",
  evolve: "bg-[rgb(139,92,246)]",
  ability: "bg-[rgb(217,70,239)]",
  supporter: "bg-[rgb(22,163,74)]",
  item: "bg-[rgb(14,165,233)]",
  tool: "bg-[rgb(245,158,11)]",
  stadium: "bg-[rgb(120,113,108)]",
  win: "bg-[rgb(5,150,105)]",
  loss: "bg-[rgb(225,29,72)]",
  attack: "bg-[rgb(239,68,68)]",
  ko: "bg-[rgb(190,18,60)]",
  other: "bg-[rgb(100,116,139)]"
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
    <span className="inline-flex h-4 min-w-0 items-center gap-2 whitespace-nowrap text-[0.66rem] font-semibold uppercase leading-none tracking-[0.05em] text-muted-foreground">
      <span
        aria-hidden="true"
        className={["h-2 w-2 shrink-0 rounded-full", actionTagDotClassNames[tag]].join(" ")}
      />
      <span className="truncate">{label}</span>
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
    <div className="grid min-w-0 gap-1">
      <ActionTag resolved={resolved} title={title} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CollapsibleActionHeader({
  children,
  resolved,
  title
}: {
  children: ReactNode;
  resolved?: BattleLogResolvedActionTag;
  title: string;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <ActionTag resolved={resolved} title={title} />
      <div className="min-w-0 font-semibold">{children}</div>
    </div>
  );
}

function BattleLogActionTitleText({ children }: { children: string }) {
  const parts = children.split(/\s+->\s+/);

  if (parts.length < 2) {
    return children;
  }

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {parts.map((part, index) => (
        <span className="inline-flex min-w-0 items-center gap-2" key={`${part}-${index}`}>
          {index > 0 ? (
            <>
              <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="sr-only">then</span>
            </>
          ) : null}
          <span className="min-w-0">{part}</span>
        </span>
      ))}
    </span>
  );
}

function formatDetailOutcome(text: string) {
  return text.split(/(\d+\s+cards?)/i).map((part, index) =>
    /\d+\s+cards?/i.test(part) ? (
      <strong className="font-semibold text-card-foreground" key={`${part}-${index}`}>
        {part.toUpperCase()}
      </strong>
    ) : (
      part.toUpperCase()
    )
  );
}

function DetailEventRow({ event }: { event: DetailEvent }) {
  const Icon =
    event.icon === "shuffle" ? ShuffleIcon : event.icon === "discard" ? XIcon : CopyIcon;

  return (
    <div className="flex min-w-0 items-center gap-2 text-[0.76rem] font-semibold uppercase leading-5 tracking-[0.05em] text-muted-foreground">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="shrink-0">{event.label}</span>
      <span className="min-w-0 normal-case tracking-normal text-card-foreground">
        {formatDetailOutcome(event.outcome)}
      </span>
    </div>
  );
}

function DamageBreakdownBlock({ breakdown, keyValue }: { breakdown: DamageBreakdown; keyValue: string }) {
  return (
    <div className="grid gap-1.5" key={keyValue}>
      <div className="flex min-w-0 items-center gap-2 text-[0.76rem] font-semibold uppercase leading-5 tracking-[0.05em] text-muted-foreground">
        <CalculatorIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>{breakdown.label}</span>
      </div>
      <div className="grid gap-1 pl-5">
        {breakdown.items.map((item, index) => (
          <div
            className={[
              "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.88rem] leading-6",
              item.tone === "total" ? "font-semibold text-card-foreground" : "text-muted-foreground"
            ].join(" ")}
            key={`${keyValue}-${item.label}-${index}`}
          >
            <span className="min-w-0">{item.label}</span>
            <span className={item.tone === "total" ? "" : "font-medium text-card-foreground"}>
              {item.damage}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderCardChips(text: string, keyValue: string) {
  const cards = compactMap(String(text || "")
    .split(","), (card) => card.trim());

  if (cards.length === 0) {
    return null;
  }

  return (
    <CardChips cards={cards} key={keyValue} keyValue={keyValue} />
  );
}

function CardChips({ cards, keyValue }: { cards: string[]; keyValue: string }) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5" key={keyValue}>
      {cards.map((card, index) => (
        <span
          className="rounded-[4px] border border-border bg-background/70 px-2 py-0.5 text-[0.76rem] font-medium leading-5 text-card-foreground/85"
          key={`${keyValue}-${card}-${index}`}
        >
          {card}
        </span>
      ))}
    </div>
  );
}

function renderIndentedLine(text: string, level = 1, keyValue?: string) {
  if (level === 1 && isCardListDetail(text)) {
    return renderCardChips(text, keyValue ?? text);
  }

  const detailEvent = getBattleLogDetailEvent(text);
  if (level === 1 && detailEvent) {
    return (
      <div className="grid gap-1.5" key={keyValue}>
        <DetailEventRow event={detailEvent} />
        {detailEvent.cards?.length ? (
          <CardChips cards={detailEvent.cards} keyValue={`${keyValue ?? text}-cards`} />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={level === 1 ? "" : "ml-5 border-l border-border pl-4"}
      key={keyValue}
    >
      <p className="m-0 flex items-start gap-2">
        <span className="text-muted-foreground">{level === 1 ? "•" : "◦"}</span>
        <span>{text}</span>
      </p>
    </div>
  );
}

function renderBattleLogActionDetails(details: string[], actionTag: BattleLogActionTag) {
  const chunks: ReactNode[] = [];
  let addedToHandCards: string[] = [];
  let addedToHandDestination = "";
  let bullets: string[] = [];
  let chunkIndex = 0;

  function renderNestedBulletGroup(items: string[], groupIndex: number) {
    if (!items.length) {
      return null;
    }

    const damageBreakdown = getBattleLogDamageBreakdown(items);
    if (damageBreakdown) {
      return (
        <DamageBreakdownBlock
          breakdown={damageBreakdown}
          key={`group-${groupIndex}`}
          keyValue={`group-${groupIndex}-damage-breakdown`}
        />
      );
    }

    const first = String(items[0] || "").trim();
    const rest = compactMap(items.slice(1), (item) => String(item || "").trim());
    const supportsNestedCards = rest.some((item) => isCardListDetail(item));

    if (supportsNestedCards && rest.length > 0) {
      return (
        <div className="grid gap-2" key={`group-${groupIndex}`}>
          {renderIndentedLine(first, 1, `group-${groupIndex}-item-0`)}
          <div className="grid gap-1">
            {rest.map((item, index) =>
              isCardListDetail(item)
                ? renderCardChips(item, `group-${groupIndex}-nested-${index}`)
                : renderIndentedLine(
                    item,
                    getBattleLogDetailEvent(item) ? 1 : 2,
                    `group-${groupIndex}-nested-${index}`
                  )
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

  function flushAddedToHandCards() {
    if (!addedToHandCards.length) {
      return;
    }

    chunks.push(
      <div className="grid gap-1.5" key={`detail-${chunkIndex}`}>
        <DetailEventRow
          event={{
            cards: addedToHandCards,
            icon: "draw",
            label: "Added",
            outcome: `${addedToHandCards.length} ${
              addedToHandCards.length === 1 ? "card" : "cards"
            } to ${addedToHandDestination || "hand"}`
          }}
        />
        <CardChips cards={addedToHandCards} keyValue={`detail-${chunkIndex}-added-cards`} />
      </div>
    );
    chunkIndex += 1;
    addedToHandCards = [];
    addedToHandDestination = "";
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

    const addedToHandDetail = getAddedToHandDetailCard(value);
    if (addedToHandDetail) {
      flushBullets();
      if (
        addedToHandDestination &&
        addedToHandDestination !== addedToHandDetail.destination
      ) {
        flushAddedToHandCards();
      }
      addedToHandDestination = addedToHandDetail.destination;
      addedToHandCards.push(addedToHandDetail.card);
      return;
    }

    flushBullets();
    flushAddedToHandCards();
    chunks.push(
      <p className="m-0" key={`detail-${chunkIndex}`}>
        {value}
      </p>
    );
    chunkIndex += 1;
  });

  flushBullets();
  flushAddedToHandCards();
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
        dot: "bg-win",
        name: "text-win"
      }
    : {
        dot: "bg-loss",
        name: "text-loss"
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
      <PrizeTrophyIcon
        className={[
          "size-4 shrink-0",
          toneClassNames.name
        ].join(" ")}
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
      ? "bg-win-bg"
      : "bg-[rgba(220,38,38,0.04)] dark:bg-[rgba(220,38,38,0.075)]";
  const headerToneClassName = !effectivePlayer
    ? "bg-muted/55"
    : effectivePlayer === selfPlayerName
      ? "bg-[rgba(22,163,74,0.12)] dark:bg-[rgba(22,163,74,0.18)]"
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
          "border-b border-border p-4 sm:px-6",
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

      <div className="grid p-4 sm:px-6">
        {actions.map((action, actionIndex) => {
          const displayActionTitle = getBattleLogDisplayActionTitle(action.title, action.details);
          const displayActionDetails = getBattleLogDisplayActionDetails(action.title, action.details);
          const resolvedActionTag = actionTagOverrides?.[actionIndex] ?? undefined;
          const displayResolvedActionTag = getDisplayActionTagOverride(
            displayActionTitle,
            displayActionDetails,
            resolvedActionTag
          );
          const actionTag = getDisplayActionTag(
            displayActionTitle,
            displayActionDetails,
            displayResolvedActionTag
          );

          if (displayActionDetails.length > 0) {
            return (
              <details
                className="group border-b border-border last:border-b-0"
                key={`${action.title}-${actionIndex}`}
              >
                <summary className="cursor-pointer list-none px-1 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <CollapsibleActionHeader
                      resolved={displayResolvedActionTag}
                      title={displayActionTitle}
                    >
                      <div className="text-[0.98rem] leading-7 text-card-foreground">
                        <BattleLogActionTitleText>
                          {formatBattleLogActionTitle(displayActionTitle, {
                            actionTag,
                            retainActor: isSetupSection
                          })}
                        </BattleLogActionTitleText>
                      </div>
                    </CollapsibleActionHeader>
                    <span className="shrink-0 pt-1.5 text-muted-foreground">
                      <ChevronIcon />
                    </span>
                  </div>
                </summary>
                <div className="grid gap-2 px-1 pb-3 pl-5 text-[0.92rem] leading-6 text-muted-foreground">
                  {renderBattleLogActionDetails(displayActionDetails, actionTag)}
                </div>
              </details>
            );
          }

          return (
            <div
              className="border-b border-border px-1 py-3 text-[1rem] leading-7 text-card-foreground last:border-b-0"
              key={`${action.title}-${actionIndex}`}
            >
              <ActionRow resolved={displayResolvedActionTag} title={displayActionTitle}>
                <div className="text-[0.98rem] leading-7 text-card-foreground">
                  <BattleLogActionTitleText>
                    {formatBattleLogActionTitle(displayActionTitle, {
                      actionTag,
                      retainActor: isSetupSection
                    })}
                  </BattleLogActionTitleText>
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
            <div className="size-40 rounded bg-muted" />
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
