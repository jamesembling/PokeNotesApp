"use client";

import { useState } from "react";
import { createLogShareAction } from "@/app/(app)/logs/actions";
import { Button } from "@/components/ui/Button";

type CopyShareLinkButtonProps = {
  logId: string;
  onFeedbackChange?: (feedback: ShareFeedback | null) => void;
};

type ShareMethod = "native-share" | "clipboard" | "prompt" | "cancelled";

export type ShareFeedback = {
  tone: "success" | "info" | "error";
  text: string;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    } catch {
      // Mobile browsers can expose the Clipboard API but reject writes once the
      // async share-link creation has completed. Fall through to manual copy.
    }
  }

  if (typeof window.prompt === "function") {
    window.prompt("Copy this share link:", text);
    return "prompt";
  }

  throw new Error("Clipboard access is unavailable in this browser.");
}

async function shareOrCopyLink(shareUrl: string): Promise<ShareMethod> {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Poke Notes Battle Log",
        text: shareUrl,
        url: shareUrl
      });
      return "native-share";
    } catch (error) {
      if (isAbortError(error)) {
        return "cancelled";
      }
    }
  }

  return copyTextToClipboard(shareUrl);
}

export function CopyShareLinkButton({ logId, onFeedbackChange }: CopyShareLinkButtonProps) {
  const [isBusy, setIsBusy] = useState(false);

  async function handleCopy() {
    setIsBusy(true);

    try {
      const { shareUrl } = await createLogShareAction(logId);
      const shareMethod = await shareOrCopyLink(shareUrl);

      if (shareMethod === "cancelled") {
        onFeedbackChange?.({
          tone: "info",
          text: "Share cancelled. Tap Copy Share Link again when you are ready."
        });
        return;
      }

      onFeedbackChange?.({
        tone: shareMethod === "prompt" ? "info" : "success",
        text:
          shareMethod === "native-share"
            ? "Share link ready. Anyone with the link can open this battle log."
            : shareMethod === "prompt"
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
