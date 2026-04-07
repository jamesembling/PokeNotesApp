import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import type { BattleLog, LogSection } from "@/types/index";

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
  return (
    <p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[var(--text-kicker)]">
      {children}
    </p>
  );
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
      <p className={["mt-1.5 text-[1.05rem] font-bold tracking-[-0.03em]", valueClassName].join(" ")}>
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
      <p className="self-end text-[0.95rem] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function LogSectionCard({ section }: { section: LogSection }) {
  const prizeEntries = Object.entries(section.prizesAfterTurn ?? {});

  return (
    <Card
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "320px"
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {section.title}
          </h2>
          {prizeEntries.length > 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              {prizeEntries
                .map(([playerName, prizes]) => `${playerName}: ${prizes} prizes`)
                .join(" · ")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col">
          {section.actions.map((action, actionIndex) => (
            <div
              className={[
                "py-3 first:pt-0 last:pb-0",
                actionIndex > 0 ? "border-t border-[var(--border)]" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={`${action.title}-${actionIndex}`}
            >
              <p className="text-sm font-semibold text-[var(--text-primary)]">{action.title}</p>
              {action.details.length > 0 ? (
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-[var(--text-muted)]">
                  {action.details.map((detail, detailIndex) => (
                    <li key={`${detail}-${detailIndex}`}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

type BattleLogDetailViewProps = {
  actions?: ReactNode;
  linkedStrategyLabel: string;
  log: BattleLog;
  notice?: ReactNode;
  timestampLabel: string;
};

export function BattleLogDetailView({
  actions,
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

  return (
    <>
      <Card className="rounded-[28px] p-6 sm:p-8">
        <div className="flex flex-col gap-8">
          {notice ? <div>{notice}</div> : null}

          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4 text-[var(--text-primary)] sm:gap-5">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <SpriteStrip className="gap-1.5" size="md" sprites={log.selfDeckSprites} />
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
                  <SpriteStrip className="gap-1.5" size="md" sprites={log.opponentDeckSprites} />
                </div>
              </div>
            </div>

            {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
          </div>

          <div className="border-b border-[var(--border)]" />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <SummaryChip>{log.format}</SummaryChip>
              <SummaryChip>{coinFlipLabel} coin toss</SummaryChip>
              {linkedStrategyLabel !== "No strategy linked" ? (
                <SummaryChip>Deck Strategy Linked</SummaryChip>
              ) : null}
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

      {log.sections.map((section, index) => (
        <LogSectionCard key={`${section.title}-${index}`} section={section} />
      ))}
    </>
  );
}
