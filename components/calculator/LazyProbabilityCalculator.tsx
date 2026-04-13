"use client";

import dynamic from "next/dynamic";

export const LazyProbabilityCalculator = dynamic(
  () =>
    import("@/components/calculator/ProbabilityCalculator").then(
      (module) => module.ProbabilityCalculator
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 text-sm text-[var(--text-muted)] shadow-[var(--shadow-card)]">
        Loading probability calculator...
      </div>
    )
  }
);
