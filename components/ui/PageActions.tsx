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
        mobile === "stack"
          ? // Stacked buttons are separate rows, so they keep every corner and border.
            "w-full flex-col gap-2 max-sm:[&>*]:!rounded-lg max-sm:[&>*]:!border-l sm:w-fit sm:flex-row sm:gap-0"
          : "w-fit",
        className
      )}
    >
      {children}
    </ButtonGroup>
  );
}
