"use client";

import type { ComponentType } from "react";
import { TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { cn } from "@/lib/utils";

type SegmentedControlOption = {
  value: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
};

type SegmentedControlProps = {
  ariaLabel: string;
  className?: string;
  options: SegmentedControlOption[];
  size?: "default" | "sm" | "icon";
};

const listSizeClasses: Record<NonNullable<SegmentedControlProps["size"]>, string> = {
  default: "h-11",
  sm: "h-9",
  icon: "h-9"
};

const triggerSizeClasses: Record<NonNullable<SegmentedControlProps["size"]>, string> = {
  default: "min-w-24 px-4",
  sm: "min-w-20 px-3 text-xs",
  icon: "w-10 flex-none px-0"
};

export function SegmentedControl({
  ariaLabel,
  className,
  options,
  size = "default"
}: SegmentedControlProps) {
  return (
    <TabsList
      aria-label={ariaLabel}
      className={cn(
        "rounded-[var(--control-radius)] border border-[var(--control-border)] bg-[var(--control-bg)] p-1 text-[var(--control-text)] shadow-[var(--control-shadow)]",
        listSizeClasses[size],
        className
      )}
    >
      {options.map(({ icon: Icon, label, value }) => (
        <TabsTrigger
          className={cn(
            "h-full rounded-[calc(var(--control-radius)_-_2px)] font-semibold data-[state=active]:bg-[var(--control-active-bg)] data-[state=active]:text-[var(--control-active-text)]",
            triggerSizeClasses[size]
          )}
          key={value}
          value={value}
        >
          {Icon ? <Icon className="size-4" /> : null}
          {size === "icon" ? <span className="sr-only">{label}</span> : label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
