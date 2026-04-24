"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BattleLogDetailShell } from "@/components/ui/BattleLogDetailShell";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import type { BattleLog } from "@/types/index";

type BattleLogDetailClientPageProps = {
  logId: string;
};

type LogDetailDataResponse = {
  log?: BattleLog;
};

const backLinkClassName =
  "inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]";

function formatImportedAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function LoadingBlock({ className }: { className: string }) {
  return (
    <div
      className={["animate-pulse rounded-xl bg-[var(--bg-surface-alt)]", className].join(" ")}
    />
  );
}

function DetailLoading() {
  return (
    <PageWidth size="standard">
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Battle Logs", href: "/logs" },
            { label: "Battle Log" }
          ]}
          title=" "
        />

        <Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <LoadingBlock className="h-20 w-full" />
            <LoadingBlock className="h-20 w-full" />
          </div>
        </Card>

        <Card>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <LoadingBlock className="h-24 w-full" />
            <LoadingBlock className="h-24 w-full" />
            <LoadingBlock className="h-24 w-full" />
            <LoadingBlock className="h-24 w-full" />
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-4">
            <LoadingBlock className="h-6 w-32" />
            <LoadingBlock className="h-20 w-full" />
            <LoadingBlock className="h-20 w-full" />
            <LoadingBlock className="h-20 w-full" />
          </div>
        </Card>
      </div>
    </PageWidth>
  );
}

function DetailError() {
  return (
    <PageWidth size="standard">
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Battle Logs", href: "/logs" },
          { label: "Not Found" }
        ]}
        title="Battle Log"
        action={
          <Link className={backLinkClassName} href="/logs" prefetch={false}>
            Back to Logs
          </Link>
        }
      />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Log not found
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            This battle log is unavailable or you do not have access to it.
          </p>
          <div>
            <Link className={backLinkClassName} href="/logs" prefetch={false}>
              Back to Logs
            </Link>
          </div>
        </div>
      </div>
    </PageWidth>
  );
}

export function BattleLogDetailClientPage({ logId }: BattleLogDetailClientPageProps) {
  const [log, setLog] = useState<BattleLog | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLog() {
      try {
        const response = await fetch(`/api/log-detail-data?id=${encodeURIComponent(logId)}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error("Could not load battle log.");
        }

        const payload = (await response.json()) as LogDetailDataResponse;

        if (!payload.log) {
          throw new Error("Battle log not found.");
        }

        setLog(payload.log);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
        setFailed(true);
      }
    }

    loadLog();

    return () => {
      controller.abort();
    };
  }, [logId]);

  if (failed) {
    return <DetailError />;
  }

  if (!log) {
    return <DetailLoading />;
  }

  const opponentDeckName = getBattleLogOpponentDisplayName(
    log.opponentDeckName,
    log.opponentDeckSprites
  );

  return (
    <PageWidth size="standard">
      <div className="flex flex-col gap-2 sm:gap-6">
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Battle Logs", href: "/logs" },
            { label: `VS ${opponentDeckName}` }
          ]}
          title=" "
        />

        <BattleLogDetailShell
          activeShare={null}
          linkedDeckId={log.linkedDeckId ?? undefined}
          linkedDeckListId={log.linkedDeckListId ?? undefined}
          linkedStrategyLabel={log.linkedDeckId ? "Linked strategy" : "No strategy linked"}
          log={log}
          timestampLabel={formatImportedAt(log.importedAt)}
          userDecks={[]}
        />
      </div>
    </PageWidth>
  );
}
