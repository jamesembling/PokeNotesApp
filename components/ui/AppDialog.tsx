"use client";

import type { ComponentProps, ReactNode } from "react";
import { DialogContent, DialogDescription, DialogTitle } from "@/components/shadcn/dialog";
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

export function AppDialogMobileFooter({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 border-t border-border bg-[var(--dialog-bg)] px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function AppDialogFooter({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "hidden shrink-0 items-center justify-end gap-2 border-t border-border bg-[var(--dialog-bg)] px-4 py-4 sm:flex lg:px-5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type AppDialogHeaderProps = ComponentProps<"div"> & {
  actions?: ReactNode;
  description: ReactNode;
  descriptionClassName?: string;
  descriptionHidden?: boolean;
  eyebrow?: ReactNode;
  title: ReactNode;
  titleClassName?: string;
};

export function AppDialogHeader({
  actions,
  className,
  description,
  descriptionClassName,
  descriptionHidden = true,
  eyebrow,
  title,
  titleClassName,
  ...props
}: AppDialogHeaderProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 min-w-0 flex-col gap-4 border-b border-border bg-card px-3 py-4 pr-14 sm:px-4 sm:pr-14 lg:flex-row lg:items-start lg:justify-between lg:px-5 lg:pr-14",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
        <DialogTitle
          className={cn(
            "text-[1.55rem] font-bold tracking-[-0.04em] text-card-foreground sm:text-[1.9rem]",
            eyebrow ? "mt-1" : "",
            titleClassName
          )}
        >
          {title}
        </DialogTitle>
        <DialogDescription
          className={cn(
            descriptionHidden ? "sr-only" : "text-sm text-muted-foreground",
            descriptionClassName
          )}
        >
          {description}
        </DialogDescription>
      </div>
      {actions ? <div className="min-w-0 shrink-0">{actions}</div> : null}
    </div>
  );
}
