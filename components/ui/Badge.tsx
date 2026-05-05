import type { ComponentProps } from "react";
import { Badge as ShadcnBadge } from "@/components/shadcn/badge";
import { cn } from "@/lib/utils";

type LegacyBadgeVariant = "default" | "win" | "loss" | "warning";
type BadgeProps = Omit<ComponentProps<typeof ShadcnBadge>, "variant"> & {
  variant?: ComponentProps<typeof ShadcnBadge>["variant"] | LegacyBadgeVariant;
};

const legacyVariantClass: Partial<Record<LegacyBadgeVariant, string>> = {
  win: "border-win-border bg-win-bg text-win",
  loss: "border-loss-border bg-loss-bg text-loss",
  warning: "border-warning-border bg-warning-bg text-warning"
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const shadcnVariant =
    variant === "win" || variant === "loss" || variant === "warning"
      ? "outline"
      : variant;

  return (
    <ShadcnBadge
      className={cn(
        "h-auto rounded-full px-3 py-1 text-[0.72rem] font-semibold tracking-[0.04em]",
        legacyVariantClass[variant as LegacyBadgeVariant],
        className
      )}
      variant={shadcnVariant}
      {...props}
    />
  );
}
