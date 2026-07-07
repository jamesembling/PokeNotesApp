import type { ReactNode } from "react";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { cn } from "@/lib/utils";

type PageActionsProps = {
  children: ReactNode;
  className?: string;
  mobile?: "wrap" | "stack";
};

export function PageActions({
  children,
  className,
  mobile = "wrap"
}: PageActionsProps) {
  return (
    <ButtonGroup
      className={cn(
        "max-w-full flex-wrap",
        mobile === "stack" ? "w-full flex-col gap-2 sm:w-fit sm:flex-row sm:gap-0" : "w-fit",
        className
      )}
    >
      {children}
    </ButtonGroup>
  );
}
