type LogsStatsProps = {
  losses: number;
  total: number;
  wins: number;
};

export function LogsStats({ losses, total, wins }: LogsStatsProps) {
  return (
    <div
      aria-label={`${total} total battle logs, ${wins} wins, ${losses} losses`}
      className="flex flex-wrap items-center gap-y-2 text-sm text-muted-foreground"
    >
      <div className="flex items-baseline gap-2 pr-5">
        <span className="text-[1.35rem] font-semibold leading-none text-card-foreground [font-variant-numeric:tabular-nums]">
          <span className="contents" data-log-stat="total">
            {total}
          </span>
        </span>
        <span>total</span>
      </div>
      <div aria-hidden="true" className="h-5 w-px bg-border" />
      <div className="flex items-baseline gap-2 px-5">
        <span className="text-[1.35rem] font-semibold leading-none text-win-strong [font-variant-numeric:tabular-nums]">
          <span className="contents" data-log-stat="wins">
            {wins}
          </span>
        </span>
        <span>wins</span>
      </div>
      <div aria-hidden="true" className="h-5 w-px bg-border" />
      <div className="flex items-baseline gap-2 pl-5">
        <span className="text-[1.35rem] font-semibold leading-none text-loss-strong [font-variant-numeric:tabular-nums]">
          <span className="contents" data-log-stat="losses">
            {losses}
          </span>
        </span>
        <span>losses</span>
      </div>
    </div>
  );
}
