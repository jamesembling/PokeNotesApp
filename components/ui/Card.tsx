import type { ComponentProps } from "react";
import { Card as ShadcnCard } from "@/components/shadcn/card";
import { cn } from "@/lib/utils";

type CardProps = ComponentProps<typeof ShadcnCard>;

export function Card({ className, ...props }: CardProps) {
  return (
    <ShadcnCard
      className={cn("p-4 sm:p-6", className)}
      {...props}
    />
  );
}
