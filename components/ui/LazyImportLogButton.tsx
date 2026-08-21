"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/shadcn/button";
import { useImportDialogData } from "@/components/ui/ImportDialogDataProvider";
import type { ImportLogDialogProps } from "@/components/ui/ImportLogDialog";
import type { DeckListSelectionOption, DeckSelectionOption } from "@/types/index";

type LazyImportLogButtonProps = {
  className?: string;
  initialUserDeckLists?: DeckListSelectionOption[];
  initialUserDecks?: DeckSelectionOption[];
  label?: string;
};

const DynamicImportLogDialog = dynamic<ImportLogDialogProps>(
  () =>
    import("@/components/ui/ImportLogDialog").then((module) => module.ImportLogDialog),
  {
    ssr: false
  }
);

let importDialogAssetsWarmed = false;

function warmImportDialogAssets() {
  if (importDialogAssetsWarmed) {
    return;
  }

  importDialogAssetsWarmed = true;
  void import("@/components/ui/ImportLogDialog");
}

export function LazyImportLogButton({
  className,
  initialUserDeckLists,
  initialUserDecks,
  label = "Import PTCGL Log"
}: LazyImportLogButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { seedUserDeckLists, seedUserDecks } = useImportDialogData();

  useEffect(() => {
    if (initialUserDeckLists) {
      seedUserDeckLists(initialUserDeckLists);
    }
    if (initialUserDecks?.length) {
      seedUserDecks(initialUserDecks);
    }
  }, [initialUserDeckLists, initialUserDecks, seedUserDeckLists, seedUserDecks]);

  return (
    <>
      <Button
        className={className}
        onFocus={warmImportDialogAssets}
        onClick={() => {
          setDialogOpen(true);
          warmImportDialogAssets();
        }}
        onPointerEnter={warmImportDialogAssets}
      >
        {label}
      </Button>
      {dialogOpen ? (
        <DynamicImportLogDialog
          initialOpen
          onClose={() => setDialogOpen(false)}
          renderTrigger={false}
        />
      ) : null}
    </>
  );
}
