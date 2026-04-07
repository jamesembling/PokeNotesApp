"use client";

import { useState } from "react";
import { createLogShareAction } from "@/app/(app)/logs/actions";
import { Button } from "@/components/ui/Button";

type CopyShareLinkButtonProps = {
  logId: string;
};

type ShareState =
  | { tone: "idle"; text: string }
  | { tone: "success"; text: string }
  | { tone: "info"; text: string }
  | { tone: "error"; text: string };

const feedbackClassName: Record<Exclude<ShareState["tone"], "idle">, string> = {
  success:
    "rounded-2xl border border-[rgba(31,138,98,0.18)] bg-[rgba(31,138,98,0.12)] px-4 py-3 text-sm font-semibold text-[var(--color-win)]",
  info:
    "rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm font-semibold text-[var(--text-muted)]",
  error:
    "rounded-2xl border border-[rgba(213,87,75,0.16)] bg-[rgba(213,87,75,0.12)] px-4 py-3 text-sm font-semibold text-[var(--color-loss)]"
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

export function CopyShareLinkButton({ logId }: CopyShareLinkButtonProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [shareState, setShareState] = useState<ShareState>({
    tone: "idle",
    text: ""
  });

  async function handleCopy() {
    setIsBusy(true);

    try {
      const { shareUrl } = await createLogShareAction(logId);
      const copyMethod = await copyTextToClipboard(shareUrl);

      setShareState({
        tone: copyMethod === "prompt" ? "info" : "success",
        text:
          copyMethod === "prompt"
            ? "Share link ready to copy. Anyone with the link can open this battle log."
            : "Share link copied. Anyone with the link can open this battle log."
      });
    } catch (error) {
      setShareState({
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
    <div className="flex flex-col gap-3">
      <Button disabled={isBusy} onClick={handleCopy} type="button" variant="secondary">
        {isBusy ? "Creating Link..." : "Copy Share Link"}
      </Button>
      {shareState.tone !== "idle" ? (
        <p className={feedbackClassName[shareState.tone]}>{shareState.text}</p>
      ) : null}
    </div>
  );
}
