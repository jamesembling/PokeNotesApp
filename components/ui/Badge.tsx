import type { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  variant?: "default" | "win" | "loss";
};

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default:
    "border border-[var(--border)] bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]",
  win: "border border-[var(--color-win-border)] bg-[var(--color-win-bg)] text-[var(--color-win)]",
  loss:
    "border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss)]"
};

export function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        variantClasses[variant]
      ].join(" ")}
    >
      {children}
    </span>
  );
}
