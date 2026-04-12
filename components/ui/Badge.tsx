import type { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  className?: string;
  variant?: "default" | "win" | "loss" | "warning";
};

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default:
    "border border-[var(--border)] bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]",
  win: "border border-[var(--color-win-border)] bg-[var(--color-win-bg)] text-[var(--color-win)]",
  loss:
    "border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss)]",
  warning:
    "border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
};

export function Badge({ children, className, variant = "default" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-3 py-1 text-[0.72rem] font-semibold tracking-[0.04em]",
        variantClasses[variant],
        className
      ].join(" ")}
    >
      {children}
    </span>
  );
}
