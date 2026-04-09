import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { LinkedDeckListPanel } from "@/components/ui/LinkedDeckListPanel";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import type { BattleLog, DeckCard, LogSection } from "@/types/index";

const SETUP_SECTION_LABELS = new Set(["setup"]);

function formatGoOrder(goOrder: "First" | "Second" | "") {
  if (goOrder === "First") {
    return "1st";
  }

  if (goOrder === "Second") {
    return "2nd";
  }

  return "Unknown";
}

function SectionKicker({ children }: { children: ReactNode }) {
  return <p className="ui-eyebrow">{children}</p>;
}

function SummaryChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(22,32,51,0.08)] px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)]">
      {children}
    </span>
  );
}

function HighlightPanel({
  kicker,
  value,
  tone = "default"
}: {
  kicker: string;
  value: string;
  tone?: "default" | "win" | "loss";
}) {
  const toneClassName =
    tone === "win"
      ? "border-[var(--color-win-border)] bg-[var(--color-win-bg)]"
      : tone === "loss"
        ? "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)]"
        : "border-[var(--border)] bg-[var(--bg-surface-alt)]";

  const valueClassName =
    tone === "win"
      ? "text-[var(--color-win)]"
      : tone === "loss"
        ? "text-[var(--color-loss)]"
        : "text-[var(--text-primary)]";

  return (
    <div className={["rounded-2xl border p-4 sm:p-5", toneClassName].join(" ")}>
      <SectionKicker>{kicker}</SectionKicker>
      <p
        className={[
          "font-display mt-1.5 text-[1.08rem] font-semibold tracking-[-0.03em]",
          valueClassName
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function DetailStat({
  label,
  value
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="grid min-h-[72px] grid-rows-[2.25rem_auto] rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 shadow-[var(--shadow-sm)]">
      <SectionKicker>{label}</SectionKicker>
      <p className="font-display self-end text-[0.98rem] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

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

function renderIndentedLine(text: string, level = 1) {
  return (
    <div
      className={level === 1 ? "pl-5" : "ml-6 border-l border-[var(--border)] pl-6"}
      key={`${level}-${text}`}
    >
      <p className="m-0 flex items-start gap-3">
        <span className="text-[var(--text-muted)]">{level === 1 ? "•" : "◦"}</span>
        <span>{text}</span>
      </p>
    </div>
  );
}

function renderBattleLogActionDetails(details: string[]) {
  const chunks: ReactNode[] = [];
  let bullets: string[] = [];

  function renderNestedBulletGroup(items: string[]) {
    if (!items.length) {
      return null;
    }

    const first = String(items[0] || "").trim();
    const rest = items.slice(1).map((item) => String(item || "").trim()).filter(Boolean);
    const supportsNestedCards =
      /\b\d+\s+drawn cards?\.?$/i.test(first) || /\b\d+\s+cards? drawn\.?$/i.test(first);

    if (supportsNestedCards && rest.length > 0) {
      return (
        <div className="grid gap-2" key={`group-${first}`}>
          {renderIndentedLine(first, 1)}
          <div className="grid gap-1">{rest.map((item) => renderIndentedLine(item, 2))}</div>
        </div>
      );
    }

    return (
      <div className="grid gap-2" key={`group-${first}`}>
        {items.map((item) => renderIndentedLine(item, 1))}
      </div>
    );
  }

  function flushBullets() {
    if (!bullets.length) {
      return;
    }

    chunks.push(renderNestedBulletGroup(bullets));
    bullets = [];
  }

  details.forEach((detail) => {
    const value = String(detail || "").trim();
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
      <p className="m-0" key={value}>
        {value}
      </p>
    );
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
  previousSection,
  section,
  selfPlayerName,
  turnNumber
}: {
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
          if (action.details.length > 0) {
            return (
              <details
                className="group border-b border-[var(--border)] py-3 last:border-b-0"
                key={`${action.title}-${actionIndex}`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-1 text-[1rem] font-bold leading-7 text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                  <span>{action.title}</span>
                  <span className="text-[var(--text-muted)]">
                    <ChevronIcon />
                  </span>
                </summary>
                <div className="mt-2 grid gap-2 px-1 text-[0.98rem] leading-7 text-[var(--text-primary)]">
                  {renderBattleLogActionDetails(action.details)}
                </div>
              </details>
            );
          }

          return (
            <div
              className="border-b border-[var(--border)] px-1 py-3 text-[1rem] leading-7 text-[var(--text-primary)] last:border-b-0"
              key={`${action.title}-${actionIndex}`}
            >
              <div className="text-[1rem] leading-7 text-[var(--text-primary)]">
                {action.title}
              </div>
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
  actions?: ReactNode;
  linkedDeckId?: string;
  linkedDeckListFormat?: string;
  linkedDeckListId?: string;
  linkedDeckListName?: string;
  linkedDeckListNotes?: string;
  linkedDeckListSortedCards?: DeckCard[];
  linkedStrategyLabel: string;
  log: BattleLog;
  notice?: ReactNode;
  timestampLabel: string;
};

export function BattleLogDetailView({
  actions,
  linkedDeckId,
  linkedDeckListFormat,
  linkedDeckListId,
  linkedDeckListName,
  linkedDeckListNotes,
  linkedDeckListSortedCards,
  linkedStrategyLabel,
  log,
  notice,
  timestampLabel
}: BattleLogDetailViewProps) {
  const opponentDeckName = getBattleLogDeckDisplayName(
    log.opponentDeckName,
    log.opponentDeckSprites
  );
  const coinFlipLabel =
    log.coinTossWon === true ? "Won" : log.coinTossWon === false ? "Lost" : "Unknown";
  const sections = Array.isArray(log.sections) ? log.sections : [];
  const turnNumbers = getSectionTurnNumbers(sections);

  return (
    <>
      <Card className="rounded-[28px] p-6 sm:p-8">
        <div className="flex flex-col gap-8">
          {notice ? <div>{notice}</div> : null}

          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4 text-[var(--text-primary)] sm:gap-5">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <SpriteStrip className="gap-1.5" size="lg" sprites={log.selfDeckSprites} />
                  <p className="truncate text-[1.02rem] font-bold tracking-[-0.03em] text-[var(--text-primary)] sm:text-[1.18rem]">
                    {log.selfPlayerName}
                  </p>
                </div>

                <p className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  vs
                </p>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <p className="truncate text-[1.02rem] font-bold tracking-[-0.03em] text-[var(--text-primary)] sm:text-[1.18rem]">
                    {log.opponentPlayerName}
                  </p>
                  <SpriteStrip className="gap-1.5" size="lg" sprites={log.opponentDeckSprites} />
                </div>
              </div>
            </div>

            {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
          </div>

          <div className="border-b border-[var(--border)]" />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <SummaryChip>{coinFlipLabel} coin toss</SummaryChip>
              {log.goOrder ? <SummaryChip>Went {log.goOrder}</SummaryChip> : null}
            </div>
            <p className="text-sm text-[var(--text-muted)]">{timestampLabel}</p>
          </div>

          <div className="border-b border-[var(--border)]" />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
            <HighlightPanel
              kicker="Match Result"
              tone={log.result === "Win" ? "win" : "loss"}
              value={log.result}
            />
            <HighlightPanel kicker="Matched Strategy" value={linkedStrategyLabel} />
          </div>

          <div className="border-b border-[var(--border)]" />

          <div className="flex flex-col gap-4">
            <SectionKicker>Match Stats</SectionKicker>
            <div className="grid gap-4 md:grid-cols-2">
              <DetailStat label="First or Second" value={formatGoOrder(log.goOrder)} />
              <DetailStat label="Number of Turns" value={log.totalTurns} />
              <DetailStat label="Your Mulligans Taken" value={log.selfMultigans} />
              <DetailStat label="Opponent Mulligans Taken" value={log.opponentMulligans} />
              <DetailStat label="Your Attack Damage" value={log.selfAttackDamage} />
              <DetailStat label="Opponent Attack Damage" value={log.opponentAttackDamage} />
              <DetailStat label="Your Prizes Taken" value={log.selfPrizesTaken} />
              <DetailStat label="Opponent Prizes Taken" value={log.opponentPrizesTaken} />
            </div>
          </div>
        </div>
      </Card>

      {linkedDeckListId && linkedDeckListName ? (
        <LinkedDeckListPanel
          deckId={linkedDeckId}
          deckListFormat={linkedDeckListFormat}
          deckListId={linkedDeckListId}
          deckListName={linkedDeckListName}
          deckListNotes={linkedDeckListNotes}
          sortedCards={linkedDeckListSortedCards ?? []}
        />
      ) : null}

      {sections.length > 0 ? (
        sections.map((section, index) => (
          <LogSectionCard
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
    </>
  );
}
