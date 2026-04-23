"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import type { LogSummaryStats } from "@/lib/db/logs";

function LogsSummarySkeleton() {
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)]"
            key={index}
          />
        ))}
      </div>
    </Card>
  );
}

export function LogsSummaryCardsClient() {
  const [stats, setStats] = useState<LogSummaryStats | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStats() {
      try {
        const response = await fetch("/api/log-summary-stats", {
          credentials: "same-origin",
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as LogSummaryStats;

        if (active) {
          setStats(payload);
        }
      } catch {
        // Summary cards are secondary; keep the page interactive if the read fails.
      }
    }

    loadStats();

    return () => {
      active = false;
    };
  }, []);

  if (!stats) {
    return <LogsSummarySkeleton />;
  }

  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Logs" value={stats.total} />
        <StatCard label="Wins" value={stats.wins} valueColor="win" />
        <StatCard label="Losses" value={stats.losses} valueColor="loss" />
      </div>
    </Card>
  );
}
