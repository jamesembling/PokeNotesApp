"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shadcn/button";

type CopyShareLinkButtonProps = {
  initialShare?: ShareLinkState | null;
  logId: string;
  onShareReady?: (share: ShareLinkState) => void;
};

type ShareMethod = "native-share" | "clipboard" | "prompt" | "cancelled";

export type ShareLinkState = {
  expiresAt: string;
  shareId: string;
  shareUrl: string;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function shouldUseNativeShare() {
  return window.matchMedia("(max-width: 859px)").matches;
}

function getNativeShare() {
  const mobileNavigator = navigator as Navigator & {
    share?: (data?: ShareData) => Promise<void>;
  };

  return typeof mobileNavigator.share === "function"
    ? mobileNavigator.share.bind(mobileNavigator)
    : null;
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
  const nativeShare = getNativeShare();

  if (nativeShare && shouldUseNativeShare()) {
    try {
      await nativeShare({
        title: "Poke Notes Battle Log",
        text: "Poke Notes Battle Log",
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

async function createLogShare(logId: string) {
  const response = await fetch("/api/log-shares", {
    body: JSON.stringify({ logId }),
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<ShareLinkState> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Could not create a share link for this battle log.");
  }

  if (!payload.shareId || !payload.shareUrl || !payload.expiresAt) {
    throw new Error("Could not create a share link for this battle log.");
  }

  return {
    expiresAt: payload.expiresAt,
    shareId: payload.shareId,
    shareUrl: payload.shareUrl
  };
}

function showShareConfirmation(shareMethod: ShareMethod) {
  const description =
    "Anyone with the link can open this battle log snapshot, including linked deck-list details when present, for 30 days.";

  if (shareMethod === "cancelled") {
    toast.info("Share cancelled", {
      description: "Tap Share Log again when you are ready."
    });
    return;
  }

  if (shareMethod === "prompt") {
    toast.info("Share link ready to copy", {
      description
    });
    return;
  }

  toast.success(shareMethod === "native-share" ? "Share link ready" : "Share link copied", {
    description
  });
}

export function CopyShareLinkButton({
  initialShare = null,
  logId,
  onShareReady
}: CopyShareLinkButtonProps) {
  const [isBusy, setIsBusy] = useState(false);

  async function handleCopy() {
    setIsBusy(true);

    try {
      const share = initialShare ?? (await createLogShare(logId));
      onShareReady?.(share);
      const { shareUrl } = share;
      const shareMethod = await shareOrCopyLink(shareUrl);
      showShareConfirmation(shareMethod);
    } catch (error) {
      toast.error("Could not share battle log", {
        description:
          error instanceof Error
            ? error.message
            : "Could not create a share link for this battle log."
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Button disabled={isBusy} onClick={handleCopy} type="button" variant="outline">
      {isBusy ? "Preparing Share..." : "Share Log"}
    </Button>
  );
}
