"use client";

import { Button } from "@/components/ui/Button";

type ImportLogButtonProps = {
  className?: string;
};

export function ImportLogButton({ className }: ImportLogButtonProps) {
  return (
    <Button
      className={className}
      onClick={() => {
        // Placeholder until log import flow lands.
      }}
    >
      Import PTCGL Log
    </Button>
  );
}
