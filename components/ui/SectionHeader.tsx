import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionTitle } from "@/components/ui/Typography";

type SectionHeaderProps = {
  actions?: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  titleId?: string;
};

export function SectionHeader({
  actions,
  className,
  eyebrow,
  title,
  titleId
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
        {title ? <SectionTitle id={titleId}>{title}</SectionTitle> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
