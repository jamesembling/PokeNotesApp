"use client";

import { useState } from "react";
import { createLogShareAction } from "@/app/(app)/logs/actions";
import { Button } from "@/components/ui/Button";

type CopyShareLinkButtonProps = {
  logId: string;
  onFeedbackChange?: (feedback: ShareFeedback | null) => void;
};

export type ShareFeedback = {
  tone: "success" | "info" | "error";
  text: string;
};

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return "clipboard";
  }

  if (typeof window.prompt === "function") {
    window.prompt("Copy this share link:", text);
    return "prompt";
  }

  throw new Error("Clipboard access is unavailable in this browser.");
}

export function CopyShareLinkButton({ logId, onFeedbackChange }: CopyShareLinkButtonProps) {
  const [isBusy, setIsBusy] = useState(false);

  async function handleCopy() {
    setIsBusy(true);

    try {
      const { shareUrl } = await createLogShareAction(logId);
      const copyMethod = await copyTextToClipboard(shareUrl);

      onFeedbackChange?.({
        tone: copyMethod === "prompt" ? "info" : "success",
        text:
          copyMethod === "prompt"
            ? "Share link ready to copy. Anyone with the link can open this battle log."
            : "Share link copied. Anyone with the link can open this battle log."
      });
    } catch (error) {
      onFeedbackChange?.({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not create a share link for this battle log."
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Button disabled={isBusy} onClick={handleCopy} type="button" variant="secondary">
      {isBusy ? "Creating Link..." : "Copy Share Link"}
    </Button>
  );
}
