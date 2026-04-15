"use client";

import { useState } from "react";
import { revokeLogShareAction } from "@/app/(app)/logs/actions";
import { Button } from "@/components/ui/Button";
import {
  CopyShareLinkButton,
  type ShareFeedback,
  type ShareLinkState
} from "@/components/ui/CopyShareLinkButton";

type ShareLinkPanelProps = {
  initialShare?: ShareLinkState | null;
  logId: string;
  onFeedbackChange?: (feedback: ShareFeedback | null) => void;
};

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function ShareLinkPanel({
  initialShare = null,
  logId,
  onFeedbackChange
}: ShareLinkPanelProps) {
  const [activeShare, setActiveShare] = useState<ShareLinkState | null>(initialShare);
  const [isRevoking, setIsRevoking] = useState(false);

  async function handleRevoke() {
    if (!activeShare) {
      return;
    }

    setIsRevoking(true);

    try {
      await revokeLogShareAction(activeShare.shareId);
      setActiveShare(null);
      onFeedbackChange?.({
        tone: "success",
        text: "Share link revoked. The previous URL stops working immediately."
      });
    } catch (error) {
      onFeedbackChange?.({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not revoke this share link right now."
      });
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <section className="rounded-[20px] border border-[rgba(43,109,246,0.14)] bg-[linear-gradient(180deg,var(--bg-surface),rgba(43,109,246,0.08))] px-4 py-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <p className="ui-eyebrow">Share Link</p>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            Create a time-limited snapshot of this battle log, including linked deck-list details
            when they exist at share time.
          </p>
        </div>

        {activeShare ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Active link
            </p>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
              <p className="break-all text-sm leading-6 text-[var(--text-primary)]">
                {activeShare.shareUrl}
              </p>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Expires on {formatExpiry(activeShare.expiresAt)}.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            No active share link yet. Create one to generate a 30-day public snapshot URL.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <CopyShareLinkButton
            logId={logId}
            onFeedbackChange={onFeedbackChange}
            onShareReady={setActiveShare}
          />
          {activeShare ? (
            <Button
              disabled={isRevoking}
              onClick={handleRevoke}
              type="button"
              variant="ghost"
            >
              {isRevoking ? "Revoking..." : "Revoke Link"}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
