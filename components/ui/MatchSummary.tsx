import type { ReactNode } from "react";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import type { BattleLog, Result } from "@/types/index";

const STAT_FORMATTER = new Intl.NumberFormat("en-GB");

type SummaryStat = {
  id: string;
  label: string;
  opponentValue: number;
  userValue: number;
};

function formatStatValue(value: number) {
  return STAT_FORMATTER.format(value);
}

function formatPlacement(goOrder: BattleLog["goOrder"]) {
  if (goOrder === "First") {
    return "1st";
  }

  if (goOrder === "Second") {
    return "2nd";
  }

  return "\u2014";
}

function getOpponentPlacement(goOrder: BattleLog["goOrder"]) {
  if (goOrder === "First") {
    return "2nd";
  }

  if (goOrder === "Second") {
    return "1st";
  }

  return "\u2014";
}

function getResultStyles(result: Result) {
  if (result === "Win") {
    return {
      className: "text-win",
      label: "W"
    };
  }

  return {
    className: "text-loss",
    label: "L"
  };
}

export function IconCircle({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full",
        className
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  leftColor,
  leftValue,
  max,
  rightColor,
  rightValue
}: {
  leftColor: string;
  leftValue: number;
  max: number;
  rightColor: string;
  rightValue: number;
}) {
  const leftRatio = max > 0 ? Math.max(0, Math.min(50, (leftValue / max) * 50)) : 0;
  const rightRatio = max > 0 ? Math.max(0, Math.min(50, (rightValue / max) * 50)) : 0;

  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--border)]" />
      <div
        className="absolute inset-y-0 right-1/2 rounded-l-full"
        style={{
          backgroundColor: leftRatio > 0 ? leftColor : "transparent",
          width: `${leftRatio}%`
        }}
      />
      <div
        className="absolute inset-y-0 left-1/2 rounded-r-full"
        style={{
          backgroundColor: rightRatio > 0 ? rightColor : "transparent",
          width: `${rightRatio}%`
        }}
      />
    </div>
  );
}

export function StatRow({ stat }: { stat: SummaryStat }) {
  const maxValue = Math.max(stat.userValue, stat.opponentValue);

  return (
    <div className="relative z-10 space-y-2 py-3.5">
      <div className="grid grid-cols-[auto_1fr_auto] items-end gap-4">
        <p className="text-[1.35rem] font-semibold leading-none tracking-[-0.02em] text-loss">
          {formatStatValue(stat.userValue)}
        </p>
        <p className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-[0.72rem]">
          {stat.label}
        </p>
        <p className="text-right text-[1.35rem] font-semibold leading-none tracking-[-0.02em] text-primary">
          {formatStatValue(stat.opponentValue)}
        </p>
      </div>
      <ProgressBar
        leftColor="var(--color-loss)"
        leftValue={stat.userValue}
        max={maxValue}
        rightColor="var(--color-brand)"
        rightValue={stat.opponentValue}
      />
    </div>
  );
}

function PlayerPanel({
  align = "left",
  label,
  placement,
  sprites
}: {
  align?: "left" | "right";
  label: string;
  placement: string;
  sprites: string[];
}) {
  return (
    <div
      className={[
        "flex min-w-0 flex-1 flex-col gap-2",
        align === "right" ? "items-start text-left lg:items-end lg:text-right" : "items-start text-left"
      ].join(" ")}
    >
      <SpriteStrip className="gap-1.5" maxVisible={2} size="lg" sprites={sprites} />
      <div className="space-y-1">
        <p className="truncate text-[0.98rem] font-semibold tracking-[-0.02em] text-card-foreground sm:text-[1rem]">
          {label}
        </p>
        <p className="text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground sm:text-sm">
          {placement}
        </p>
      </div>
    </div>
  );
}

export function MatchSummary({
  actions,
  log,
  timestampLabel
}: {
  actions?: ReactNode;
  log: BattleLog;
  timestampLabel: string;
}) {
  const resultStyles = getResultStyles(log.result);
  const stats: SummaryStat[] = [
    {
      id: "attack-damage",
      label: "Attack Damage",
      opponentValue: log.opponentAttackDamage,
      userValue: log.selfAttackDamage
    },
    {
      id: "prizes",
      label: "Prizes Taken",
      opponentValue: log.opponentPrizesTaken,
      userValue: log.selfPrizesTaken
    },
    {
      id: "mulligans",
      label: "Mulligans",
      opponentValue: log.opponentMulligans,
      userValue: log.selfMulligans
    }
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start">
          <div className="space-y-2">
            <h2 className="text-[1.85rem] font-semibold leading-tight tracking-[-0.03em] text-card-foreground sm:text-[2.15rem]">
              Match Summary
            </h2>
            <p className="text-sm text-muted-foreground">{timestampLabel}</p>
          </div>

          <div className="flex justify-start lg:justify-center">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-current/20 text-[1.1rem] font-semibold leading-none ${resultStyles.className}`}>
              {resultStyles.label}
            </span>
          </div>

          {actions ? <div className="flex flex-wrap items-center gap-3 lg:justify-end">{actions}</div> : null}
        </div>

        <div className="border-t border-border pt-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4 sm:gap-6 lg:flex lg:flex-row lg:items-center lg:gap-10">
            <PlayerPanel
              label={log.selfPlayerName}
              placement={formatPlacement(log.goOrder)}
              sprites={log.selfDeckSprites}
            />

            <div className="flex flex-col items-center justify-center gap-1.5 self-center lg:gap-2">
              <IconCircle className="h-9 w-9 border border-border bg-muted text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground sm:h-11 sm:w-11 sm:text-sm">
                VS
              </IconCircle>
              <div className="text-center">
                <p className="text-[2rem] font-semibold leading-none tracking-[-0.04em] text-card-foreground sm:text-[2.55rem]">
                  {log.totalTurns}
                </p>
                <p className="mt-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:mt-1.5 sm:text-sm">
                  Total Turns
                </p>
              </div>
            </div>

            <PlayerPanel
              align="right"
              label={log.opponentPlayerName}
              placement={getOpponentPlacement(log.goOrder)}
              sprites={log.opponentDeckSprites}
            />
          </div>
        </div>

        <div className="relative border-t border-border pt-1">
          <div className="absolute bottom-0 left-1/2 top-0 hidden w-px -translate-x-1/2 bg-[var(--border)] lg:block" />
          <div className="divide-y divide-[var(--border)]">
            {stats.map((stat) => (
              <StatRow key={stat.id} stat={stat} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
