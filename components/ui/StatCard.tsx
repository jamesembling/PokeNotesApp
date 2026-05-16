type StatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  size?: "default" | "compact";
  valueColor?: "win" | "loss" | "default";
};

const valueClasses: Record<NonNullable<StatCardProps["valueColor"]>, string> = {
  default: "text-card-foreground",
  win: "text-win",
  loss: "text-loss"
};

export function StatCard({
  label,
  value,
  detail,
  size = "default",
  valueColor = "default"
}: StatCardProps) {
  return (
    <div
      className={[
        "grid h-full rounded-xl bg-muted",
        size === "compact" ? "p-3 sm:p-4" : "p-4",
        detail
          ? "grid-rows-[2rem_auto_1fr]"
          : size === "compact"
            ? "grid-rows-[2.1rem_auto] gap-2"
            : "content-start gap-3"
      ].join(" ")}
    >
      <p
        className={[
          "font-medium uppercase leading-tight text-muted-foreground",
          size === "compact" ? "text-[0.68rem] tracking-[0.18em] sm:text-xs sm:tracking-wide" : "text-xs tracking-wide"
        ].join(" ")}
      >
        {label}
      </p>
      <p
        className={[
          "font-semibold leading-none tracking-[-0.02em] [font-variant-numeric:tabular-nums]",
          size === "compact" ? "text-[1.5rem] sm:text-3xl" : "text-3xl",
          valueClasses[valueColor]
        ].join(" ")}
      >
        {value}
      </p>
      {detail ? <p className="mt-1 self-end text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
