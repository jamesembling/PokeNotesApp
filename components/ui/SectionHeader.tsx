import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionTitle } from "@/components/ui/Typography";

type SectionHeaderProps = {
  actions?: ReactNode;
  className?: string;
  eyebrow?: string;
  eyebrowAs?: "p" | "h2" | "h3";
  eyebrowId?: string;
  title?: string;
  titleId?: string;
  titleSize?: "default" | "sm" | "lg";
};

export function SectionHeader({
  actions,
  className,
  eyebrow,
  eyebrowAs: Eyebrow = "p",
  eyebrowId,
  title,
  titleId,
  titleSize = "default"
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <Eyebrow className="ui-eyebrow" id={eyebrowId}>
            {eyebrow}
          </Eyebrow>
        ) : null}
        {title ? <SectionTitle id={titleId} size={titleSize}>{title}</SectionTitle> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
