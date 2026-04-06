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
    <div className="rounded-xl bg-[var(--bg-surface-alt)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className={["mt-2 text-3xl font-bold", valueClasses[valueColor]].join(" ")}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-[var(--text-muted)]">{detail}</p> : null}
    </div>
  );
}
