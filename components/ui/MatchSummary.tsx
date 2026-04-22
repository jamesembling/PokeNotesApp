import type { CSSProperties, ReactNode } from "react";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import type { BattleLog, Result } from "@/types/index";

type SummaryStat = {
  id: string;
  label: string;
  opponentValue: number;
  userValue: number;
};

const COLORS = {
  blue: "#2f72f5",
  blueTint: "#eef4ff",
  red: "#d4524a",
  track: "#eef1f6"
} as const;

function formatStatValue(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
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
      backgroundColor: "#edf9f1",
      borderColor: "#d8eadf",
      color: "#1f8a4c"
    };
  }

  return {
    backgroundColor: "#fdf1f0",
    borderColor: "#f0d7d4",
    color: "#c5443e"
  };
}


export function IconCircle({
  children,
  className = "",
  style
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
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
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#eef1f6]">
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/80" />
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
    <div className="relative z-10 space-y-2 py-4">
      <div className="grid grid-cols-[auto_1fr_auto] items-end gap-4">
        <p className="text-[1.45rem] font-semibold leading-none tracking-[-0.03em] text-[#d4524a]">
          {formatStatValue(stat.userValue)}
        </p>
        <p className="text-center text-[0.72rem] font-semibold uppercase tracking-[0.3em] text-[#7b8799]">
          {stat.label}
        </p>
        <p className="text-right text-[1.45rem] font-semibold leading-none tracking-[-0.03em] text-[#2f72f5]">
          {formatStatValue(stat.opponentValue)}
        </p>
      </div>
      <ProgressBar
        leftColor={COLORS.red}
        leftValue={stat.userValue}
        max={maxValue}
        rightColor={COLORS.blue}
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
        <p className="truncate text-[0.98rem] font-semibold tracking-[-0.02em] text-[#132238] sm:text-[1rem]">
          {label}
        </p>
        <p className="text-[0.72rem] uppercase tracking-[0.14em] text-[#7b8799] sm:text-sm">
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
  const resultLabel = log.result.toUpperCase();
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
    <section className="overflow-hidden rounded-[30px] border border-[#e7ebf2] bg-white px-5 py-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)] sm:px-7 sm:py-7 lg:px-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-[2rem] font-semibold tracking-[-0.05em] text-[#132238] sm:text-[2.35rem]">
              Match Summary
            </h2>
            <p className="max-w-[42rem] text-[1rem] text-[#64748b] sm:text-[1.05rem]">
              Overview of your performance in this match.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <p
              className="text-[1.35rem] font-semibold leading-none tracking-[0.14em]"
              style={{ color: getResultStyles(log.result).color }}
            >
              {resultLabel}
            </p>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <p className="text-sm text-[#64748b]">{timestampLabel}</p>
              {actions ? <div className="flex flex-wrap items-center gap-3 lg:justify-end">{actions}</div> : null}
            </div>
          </div>
        </div>

        <div className="border-t border-[#edf1f6] pt-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4 sm:gap-6 lg:flex lg:flex-row lg:items-center lg:gap-10">
            <PlayerPanel
              label={log.selfPlayerName}
              placement={formatPlacement(log.goOrder)}
              sprites={log.selfDeckSprites}
            />

            <div className="flex flex-col items-center justify-center gap-1.5 self-center lg:gap-2">
              <IconCircle className="h-9 w-9 border border-[#e7ebf2] bg-[#f8fafc] text-[0.72rem] font-semibold tracking-[0.12em] text-[#64748b] sm:h-11 sm:w-11 sm:text-sm">
                VS
              </IconCircle>
              <div className="text-center">
                <p className="text-[2rem] font-semibold leading-none tracking-[-0.06em] text-[#132238] sm:text-[2.8rem]">
                  {log.totalTurns}
                </p>
                <p className="mt-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-[#7b8799] sm:mt-1.5 sm:text-sm">
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

        <div className="relative border-t border-[#edf1f6] pt-2">
          <div className="absolute bottom-0 left-1/2 top-0 hidden w-px -translate-x-1/2 bg-[#eef2f7] lg:block" />
          <div className="divide-y divide-[#edf1f6]">
            {stats.map((stat) => (
              <StatRow key={stat.id} stat={stat} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
