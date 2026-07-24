"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { MessageSquareTextIcon } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import type { MatchNotesDialogProps } from "@/components/ui/MatchNotesDialog";
import { cn } from "@/lib/utils";

const DynamicMatchNotesDialog = dynamic<MatchNotesDialogProps>(
  () => import("@/components/ui/MatchNotesDialog").then((module) => module.MatchNotesDialog),
  {
    ssr: false
  }
);

export function LazyMatchNotesButton({
  className,
  iconOnly = false,
  logId,
  notes
}: {
  className?: string;
  iconOnly?: boolean;
  logId: string;
  notes: string | null;
}) {
  const [hasOpened, setHasOpened] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = notes ? "View match notes" : "Add match notes";

  return (
    <>
      <Button
        aria-label={iconOnly ? label : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={cn("min-h-11", className)}
        onClick={() => {
          setHasOpened(true);
          setIsOpen(true);
        }}
        ref={triggerRef}
        size={iconOnly ? "icon-lg" : "default"}
        variant="outline"
      >
        {iconOnly ? (
          <>
            <MessageSquareTextIcon className="size-5" />
            <span className="sr-only">{label}</span>
          </>
        ) : (
          label
        )}
      </Button>
      {hasOpened ? (
        <DynamicMatchNotesDialog
          logId={logId}
          notes={notes}
          onOpenChange={setIsOpen}
          open={isOpen}
          returnFocusRef={triggerRef}
        />
      ) : null}
    </>
  );
}
