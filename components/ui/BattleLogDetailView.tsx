import type { ReactNode } from "react";
import { ArrowRightIcon, CalculatorIcon, CopyIcon, ShuffleIcon, XIcon } from "lucide-react";
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
  getBattleLogDisplayActionDetails,
  getBattleLogDisplayActionTitle,
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

function PrizeTrophyIcon({ className = "h-4 w-4" }: { className?: string }) {
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
              <ArrowRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
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

function getDetailCardCountLabel(cardCount: number) {
  return `${cardCount} ${cardCount === 1 ? "card" : "cards"}`;
}

function cleanDetailOwnerText(text: string) {
  return cleanDetailActorText(text).replace(/^[\p{L}\p{N}_.-]+['’]s\s+/u, "");
}

function getNamedDetailCards(text: string) {
  const value = cleanDetailActorText(text);

  if (
    !value ||
    /\b(?:a\s+card|\d+\s+cards?)\b/i.test(value) ||
    /\b(?:active|bench|deck|hand|into|from|their|the)\b/i.test(value)
  ) {
    return [];
  }

  return value
    .split(",")
    .map((card) => card.trim())
    .filter(Boolean);
}

type DetailEvent = {
  cards?: string[];
  icon: "discard" | "draw" | "shuffle";
  label: string;
  outcome: string;
};

type DamageBreakdownItem = {
  damage: string;
  label: string;
  tone: "base" | "modifier" | "total";
};

type DamageBreakdown = {
  items: DamageBreakdownItem[];
  label: string;
};

export function getBattleLogDetailEvent(text: string): DetailEvent | null {
  const value = String(text || "").trim();
  const drewMatch = value.match(/^(?:.+?\s+)?drew\s+(.+)$/i);

  if (drewMatch?.[1]) {
    const namedCards = getNamedDetailCards(drewMatch[1]);
    const outcome = namedCards.length > 0
      ? getDetailCardCountLabel(namedCards.length)
      : cleanDetailActorText(drewMatch[1]).replace(/^a card$/i, "1 card");

    return {
      cards: namedCards,
      icon: "draw",
      label: "Drew",
      outcome
    };
  }

  const shuffledMatch = value.match(/^(?:.+?\s+)?shuffled\s+(.+?)\s+into\s+(?:their|the)\s+deck$/i);

  if (shuffledMatch?.[1]) {
    return {
      icon: "shuffle",
      label: "Shuffled",
      outcome: cleanDetailActorText(shuffledMatch[1])
    };
  }

  const passiveSingleDiscardMatch = value.match(/^(.+?)\s+was\s+discarded\s+from\s+(.+)$/i);

  if (passiveSingleDiscardMatch?.[1] && passiveSingleDiscardMatch[2]) {
    const discardedCard = cleanDetailActorText(passiveSingleDiscardMatch[1]);
    const discardSource = cleanDetailOwnerText(passiveSingleDiscardMatch[2]);

    return {
      cards: discardedCard ? [discardedCard] : [],
      icon: "discard",
      label: "Discarded",
      outcome: `1 card from ${discardSource}`
    };
  }

  const passiveCountDiscardMatch = value.match(/^(\d+)\s+cards?\s+were\s+discarded\s+from\s+(.+)$/i);

  if (passiveCountDiscardMatch?.[1] && passiveCountDiscardMatch[2]) {
    const discardSource = cleanDetailOwnerText(passiveCountDiscardMatch[2]);

    return {
      icon: "discard",
      label: "Discarded",
      outcome: `${getDetailCardCountLabel(Number(passiveCountDiscardMatch[1]))} from ${discardSource}`
    };
  }

  const discardedMatch = value.match(/^(?:.+?\s+)?discarded\s+(.+)$/i);

  if (discardedMatch?.[1]) {
    const namedCards = getNamedDetailCards(discardedMatch[1]);
    const outcome = namedCards.length > 0
      ? getDetailCardCountLabel(namedCards.length)
      : cleanDetailActorText(discardedMatch[1]).replace(/^a card$/i, "1 card");

    return {
      cards: namedCards,
      icon: "discard",
      label: "Discarded",
      outcome
    };
  }

  return null;
}

export function getBattleLogDamageBreakdown(items: string[]): DamageBreakdown | null {
  const [first, ...rest] = items.map((item) => cleanDetailActorText(item));

  if (!/^damage breakdown:?$/i.test(first || "")) {
    return null;
  }

  const breakdownItems = rest
    .map((item): DamageBreakdownItem | null => {
      const itemMatch = item.match(/^(.+?):\s*(\d+\+?)\s+damage$/i);

      if (!itemMatch?.[1] || !itemMatch[2]) {
        return null;
      }

      const label = cleanDetailActorText(itemMatch[1]);
      const normalizedLabel = label.toLowerCase();

      return {
        damage: `${itemMatch[2]} damage`,
        label,
        tone: normalizedLabel.startsWith("base damage")
          ? "base"
          : normalizedLabel.startsWith("total damage")
            ? "total"
            : "modifier"
      };
    })
    .filter((item): item is DamageBreakdownItem => item !== null);

  if (breakdownItems.length === 0) {
    return null;
  }

  return {
    items: breakdownItems,
    label: "Damage breakdown"
  };
}

function cleanDetailActorText(text: string) {
  return String(text || "")
    .replace(/\.$/, "")
    .trim();
}

function DetailEventRow({ event }: { event: DetailEvent }) {
  const Icon =
    event.icon === "shuffle" ? ShuffleIcon : event.icon === "discard" ? XIcon : CopyIcon;

  return (
    <div className="flex min-w-0 items-center gap-2 text-[0.76rem] font-semibold uppercase leading-5 tracking-[0.05em] text-muted-foreground">
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
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
        <CalculatorIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
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

function isCardListDetail(text: string) {
  const value = String(text || "").trim();

  return (
    value.includes(",") &&
    !/[.!?]$/.test(value) &&
    !/\b(?:drew|draw|shuffled|discarded|moved|switched|played|attached|evolved|retreated|took|put|damage|deck|hand|active|bench)\b/i.test(value)
  );
}

function renderCardChips(text: string, keyValue: string) {
  const cards = String(text || "")
    .split(",")
    .map((card) => card.trim())
    .filter(Boolean);

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

function hasDamageDetail(details: string[]) {
  return details.some((detail) => /\b(?:for|took)\s+\d+\+?\s+damage\b/i.test(String(detail || "")));
}

function hasPossessivePokemonUsedAction(actionTitle: string) {
  return /^[A-Za-z0-9_.-]+'s\s+.+\s+used\b/i.test(String(actionTitle || "").trim());
}

export function getDisplayActionTag(
  actionTitle: string,
  details: string[],
  resolvedActionTag?: BattleLogResolvedActionTag
): BattleLogActionTag {
  if (resolvedActionTag) {
    return resolvedActionTag.tag;
  }

  const classifiedActionTag = classifyBattleLogActionTitle(actionTitle);

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
    const rest = items.slice(1).map((item) => String(item || "").trim()).filter(Boolean);
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
      <PrizeTrophyIcon
        className={[
          "h-4 w-4 shrink-0",
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

      <div className="grid px-4 py-4 sm:px-6">
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
