"use client";

import type { ComponentProps } from "react";
import { DialogContent } from "@/components/shadcn/dialog";
import { cn } from "@/lib/utils";

type AppDialogContentProps = ComponentProps<typeof DialogContent> & {
  size?: "md" | "lg" | "xl" | "compact";
};

const sizeClasses: Record<NonNullable<AppDialogContentProps["size"]>, string> = {
  md: "max-w-3xl sm:max-w-3xl",
  lg: "max-w-4xl sm:max-w-4xl",
  xl: "max-w-5xl sm:max-w-5xl",
  compact: "w-[calc(100vw-2rem)] max-w-[22.5rem] sm:max-w-3xl"
};

export function AppDialogContent({
  className,
  size = "md",
  ...props
}: AppDialogContentProps) {
  return (
    <DialogContent
      className={cn(
        "flex max-h-[calc(100dvh-1rem)] min-w-0 flex-col overflow-hidden rounded-[var(--dialog-radius-compact)] border border-[var(--dialog-border)] bg-[var(--dialog-bg)] p-0 shadow-[var(--dialog-shadow)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[var(--dialog-radius)]",
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}
