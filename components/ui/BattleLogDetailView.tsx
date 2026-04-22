import type { ReactNode } from "react";
import type {
  BattleLogActionTagOverrides,
  BattleLogResolvedActionTag
} from "@/lib/battle-log/action-tags";
import { Card } from "@/components/ui/Card";
import { MatchSummary } from "@/components/ui/MatchSummary";
import { LinkedDeckListPanel } from "@/components/ui/LinkedDeckListPanel";
import {
  classifyBattleLogActionTitle,
  getBattleLogActionTagLabel,
  type BattleLogActionTag
} from "@/lib/battle-log/display";
import type { BattleLog, DeckCard, LogSection } from "@/types/index";

const SETUP_SECTION_LABELS = new Set(["setup"]);

function SectionKicker({ children }: { children: ReactNode }) {
  return <p className="ui-eyebrow">{children}</p>;
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
    "border-[var(--border)] bg-[var(--bg-surface-alt)] text-[var(--text-muted)]"
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

function stripTerminalPeriod(value: string) {
  return String(value || "").trim().replace(/\.$/, "");
}

function normalizeBattleLogActionDetails(details: string[]) {
  return details
    .map((detail) =>
      stripTerminalPeriod(
        String(detail || "")
          .trim()
          .replace(/^[-•]\s*/, "")
      )
        .trim()
    )
    .filter(Boolean);
}

function isCardListDetail(detail: string) {
  return detail.split(",").map((part) => part.trim()).filter(Boolean).length >= 3;
}

function isCardCountDetail(detail: string) {
  return /\b(?:drew|drawn|shuffled)\s+\d+\s+cards?\b/i.test(detail);
}

function splitBattleLogActionDetails(details: string[]) {
  const normalized = normalizeBattleLogActionDetails(details);
  if (normalized.length === 0) {
    return {
      inlineSummary: null,
      subtextLines: [] as string[]
    };
  }

  const inlineParts: string[] = [];
  const subtextLines: string[] = [];

  normalized.forEach((detail, index) => {
    const previousDetail = normalized[index - 1] ?? "";
    const shouldMoveToSubtext = isCardListDetail(detail) && isCardCountDetail(previousDetail);

    if (shouldMoveToSubtext) {
      subtextLines.push(detail);
      return;
    }

    inlineParts.push(detail);
  });

  return {
    inlineSummary: inlineParts.length > 0 ? inlineParts.join(" · ") : null,
    subtextLines
  };
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

function getOrderedPlayerNames(
  section: LogSection,
  previousSection: LogSection | null,
  selfPlayerName: string
) {
  const sectionPlayerNames = Object.keys(section.prizesAfterTurn ?? {});
  const previousPlayerNames = Object.keys(previousSection?.prizesAfterTurn ?? {});
  const allPlayerNames = Array.from(
    new Set([selfPlayerName, ...sectionPlayerNames, ...previousPlayerNames].filter(Boolean))
  );
  const effectivePlayer = SETUP_SECTION_LABELS.has(String(section.title || "").trim().toLowerCase())
    ? ""
    : String(section.player || "").trim();

  if (!effectivePlayer) {
    return allPlayerNames;
  }

  return [
    effectivePlayer,
    ...allPlayerNames.filter((playerName) => playerName !== effectivePlayer)
  ];
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
  const toneClassName = !effectivePlayer
    ? "bg-[var(--bg-surface)]"
    : effectivePlayer === selfPlayerName
      ? "bg-[rgba(191,219,254,0.72)]"
      : "bg-[rgba(251,207,232,0.6)]";
  const orderedPlayerNames = getOrderedPlayerNames(section, previousSection, selfPlayerName);
  const actions = section.actions.filter(
    (action) => !SETUP_SECTION_LABELS.has(String(action.title || "").trim().toLowerCase())
  );

  return (
    <article
      className={[
        "rounded-[24px] border border-[var(--border)] px-4 py-4 text-[var(--text-primary)] shadow-[var(--shadow-sm)] sm:px-6",
        toneClassName
      ].join(" ")}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "360px"
      }}
    >
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="font-display m-0 text-[1.34rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            {effectivePlayer ? `${effectivePlayer}'s Turn` : section.title}
          </h3>
          {orderedPlayerNames.length > 0 ? (
            <div className="mt-1.5 grid gap-1 text-[0.98rem] leading-6 text-[var(--text-muted)]">
              {orderedPlayerNames.map((playerName) => {
                const prizes = section.prizesAfterTurn?.[playerName];
                const previousPrizes = previousSection?.prizesAfterTurn?.[playerName];

                if (typeof prizes !== "number") {
                  return null;
                }

                return (
                  <p key={playerName}>
                    {typeof previousPrizes === "number" && previousPrizes !== prizes
                      ? `${playerName}: ${previousPrizes} → ${prizes} prizes`
                      : `${playerName}: ${prizes} prizes`}
                  </p>
                );
              })}
            </div>
          ) : null}
        </div>

        {!isSetupSection && turnNumber ? (
          <span className="inline-flex items-center rounded-full bg-[rgba(22,32,51,0.08)] px-4 py-1.5 text-[0.98rem] font-semibold text-[var(--text-muted)]">
            Turn {turnNumber}
          </span>
        ) : null}
      </div>

      <div className="grid gap-1">
        {actions.map((action, actionIndex) => {
          const resolvedActionTag = actionTagOverrides?.[actionIndex] ?? undefined;
          const displayTitle = stripTerminalPeriod(action.title);
          const { inlineSummary, subtextLines } = splitBattleLogActionDetails(action.details);

          return (
            <div
              className="border-b border-[var(--border)] px-1 py-3 text-[1rem] leading-7 text-[var(--text-primary)] last:border-b-0"
              key={`${action.title}-${actionIndex}`}
            >
              <ActionRow resolved={resolvedActionTag} title={action.title}>
                <div className="min-w-0">
                  <div className="text-[0.98rem] leading-7 text-[var(--text-primary)]">
                    {displayTitle}
                    {inlineSummary ? ` → ${inlineSummary}` : ""}
                  </div>
                  {subtextLines.length > 0 ? (
                    <div className="mt-0.5 grid gap-0.5 text-[0.88rem] leading-6 text-[var(--text-muted)]">
                      {subtextLines.map((line, subtextIndex) => (
                        <div key={`${action.title}-${actionIndex}-subtext-${subtextIndex}`}>{line}</div>
                      ))}
                    </div>
                  ) : null}
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
  linkedDeckId?: string;
  linkedDeckListFormat?: string;
  linkedDeckListId?: string;
  linkedDeckListName?: string;
  linkedDeckListNotes?: string;
  linkedDeckListRawList?: string;
  linkedDeckListSortedCards?: DeckCard[];
  linkedStrategyLabel: string;
  log: BattleLog;
  mobileNavigation?: ReactNode;
  notice?: ReactNode;
  timestampLabel: string;
};

export function BattleLogDetailView({
  actionTagOverrides,
  actions,
  footerAction,
  linkedDeckId,
  linkedDeckListFormat,
  linkedDeckListId,
  linkedDeckListName,
  linkedDeckListNotes,
  linkedDeckListRawList,
  linkedDeckListSortedCards,
  linkedStrategyLabel,
  log,
  mobileNavigation,
  notice,
  timestampLabel
}: BattleLogDetailViewProps) {
  const sections = Array.isArray(log.sections) ? log.sections : [];
  const turnNumbers = getSectionTurnNumbers(sections);

  return (
    <>
      {mobileNavigation ? <div className="mb-0 sm:hidden">{mobileNavigation}</div> : null}

      <MatchSummary actions={actions} log={log} timestampLabel={timestampLabel} />

      {notice ? <div>{notice}</div> : null}

      {linkedDeckListName ? (
        <LinkedDeckListPanel
          deckId={linkedDeckId}
          deckListFormat={linkedDeckListFormat}
          deckListId={linkedDeckListId ?? "shared-linked-deck-list"}
          deckListName={linkedDeckListName}
          deckListNotes={linkedDeckListNotes}
          rawList={linkedDeckListRawList}
          sortedCards={linkedDeckListSortedCards ?? []}
        />
      ) : null}

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
      ) : (
        <Card>
          <div className="whitespace-pre-wrap font-mono text-[0.92rem] leading-6 text-[var(--text-primary)]">
            {log.rawLog || "No parsed battle log stored for this record."}
          </div>
        </Card>
      )}

      {footerAction ? <div>{footerAction}</div> : null}
    </>
  );
}
