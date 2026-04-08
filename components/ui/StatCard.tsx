type StatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  valueColor?: "win" | "loss" | "default";
};

const valueClasses: Record<NonNullable<StatCardProps["valueColor"]>, string> = {
  default: "text-[var(--text-primary)]",
  win: "text-[var(--color-win)]",
  loss: "text-[var(--color-loss)]"
};

export function StatCard({
  label,
  value,
  detail,
  valueColor = "default"
}: StatCardProps) {
  return (
    <div className="grid h-full grid-rows-[2rem_auto_1fr] rounded-xl bg-[var(--bg-surface-alt)] p-4">
      <p className="text-xs font-medium uppercase leading-tight tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={[
          "font-display text-3xl font-semibold leading-none tracking-[-0.04em] [font-variant-numeric:tabular-nums]",
          valueClasses[valueColor]
        ].join(" ")}
      >
        {value}
      </p>
      {detail ? <p className="mt-1 self-end text-xs text-[var(--text-muted)]">{detail}</p> : null}
    </div>
  );
}
