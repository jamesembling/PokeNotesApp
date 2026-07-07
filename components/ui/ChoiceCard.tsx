"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

type ChoiceCardProps = {
  checked: boolean;
  children?: ReactNode;
  className?: string;
  label: string;
  onClick: () => void;
};

export function ChoiceCard({
  checked,
  children,
  className,
  label,
  onClick
}: ChoiceCardProps) {
  return (
    <Button
      aria-checked={checked}
      className={cn(
        "h-auto justify-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        checked
          ? "border-[var(--choice-active-border)] bg-[var(--choice-active-bg)] text-[var(--choice-active-text)]"
          : "border-[var(--choice-border)] bg-[var(--choice-bg)] text-[var(--choice-text)]",
        className
      )}
      onClick={onClick}
      role="radio"
      type="button"
      variant="ghost"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 items-center justify-center rounded-full border",
          checked ? "border-[var(--choice-active-border)]" : "border-[var(--choice-border)]"
        )}
      >
        <span className={cn("size-2.5 rounded-full", checked ? "bg-primary" : "bg-transparent")} />
      </span>
      <span className="text-sm font-medium">{children ?? label}</span>
    </Button>
  );
}
