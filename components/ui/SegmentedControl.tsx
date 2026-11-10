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
  appearance?: "segmented" | "line";
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
  size = "default",
  appearance = "segmented"
}: SegmentedControlProps) {
  return (
    <TabsList
      aria-label={ariaLabel}
      variant={appearance === "line" ? "line" : "default"}
      className={cn(
        appearance === "line"
          ? "gap-6 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none max-sm:h-11"
          : "rounded-[var(--control-radius)] border border-[var(--control-border)] bg-[var(--control-bg)] p-1 text-[var(--control-text)] shadow-[var(--control-shadow)]",
        listSizeClasses[size],
        className
      )}
    >
      {options.map(({ icon: Icon, label, value }) => (
        <TabsTrigger
          className={cn(
            "h-full font-semibold",
            appearance === "line"
              ? "min-w-0 flex-none max-sm:min-h-11 max-sm:min-w-11 rounded-none border-x-0 border-t-0 border-b-2 px-0 text-sm data-[state=active]:border-b-card-foreground data-[state=active]:bg-transparent data-[state=active]:text-card-foreground dark:data-[state=active]:border-x-0 dark:data-[state=active]:border-t-0 dark:data-[state=active]:border-b-card-foreground dark:data-[state=active]:bg-transparent"
              : cn("rounded-[calc(var(--control-radius)_-_2px)] data-[state=active]:bg-[var(--control-active-bg)] data-[state=active]:text-[var(--control-active-text)]", triggerSizeClasses[size])
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
