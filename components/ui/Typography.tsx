import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type TypographyProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
  id?: string;
};

type SizedTypographyProps<T extends ElementType> = TypographyProps<T> & {
  size?: "default" | "sm" | "lg";
};

export function PageTitle<T extends ElementType = "h1">({
  as,
  children,
  className,
  id
}: TypographyProps<T>) {
  const Comp = as ?? "h1";

  return (
    <Comp
      className={cn(
        "text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-card-foreground sm:text-4xl",
        className
      )}
      id={id}
    >
      {children}
    </Comp>
  );
}

export function DetailTitle<T extends ElementType = "h1">({
  as,
  children,
  className,
  id
}: TypographyProps<T>) {
  const Comp = as ?? "h1";

  return (
    <Comp
      className={cn(
        "text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-card-foreground sm:text-4xl",
        className
      )}
      id={id}
    >
      {children}
    </Comp>
  );
}

export function SectionTitle<T extends ElementType = "h2">({
  as,
  children,
  className,
  id,
  size = "default"
}: SizedTypographyProps<T>) {
  const Comp = as ?? "h2";
  const sizeClassName =
    size === "lg"
      ? "text-[1.85rem] leading-tight tracking-[-0.03em] sm:text-[2.15rem]"
      : size === "sm"
        ? "text-[1.25rem] leading-tight tracking-[-0.03em]"
        : "text-[1.3rem] leading-tight tracking-[-0.03em]";

  return (
    <Comp className={cn("font-semibold text-card-foreground", sizeClassName, className)} id={id}>
      {children}
    </Comp>
  );
}

export function ItemTitle<T extends ElementType = "h3">({
  as,
  children,
  className,
  id,
  size = "default"
}: SizedTypographyProps<T>) {
  const Comp = as ?? "h3";
  const sizeClassName =
    size === "lg"
      ? "text-[1.15rem] tracking-[-0.03em]"
      : size === "sm"
        ? "text-[1.02rem] leading-tight tracking-[-0.025em]"
        : "text-[1.08rem] leading-tight tracking-[-0.025em]";

  return (
    <Comp className={cn("font-display font-semibold text-card-foreground", sizeClassName, className)} id={id}>
      {children}
    </Comp>
  );
}
