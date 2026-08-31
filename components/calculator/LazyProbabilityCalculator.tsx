"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./calculator.module.css";

function CalculatorLoadingState() {
  return (
    <div className={styles.root}>
      <PageHeader breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Probability Calculator" }]} title="Probability Calculator" />
      <div aria-label="Loading probability calculator" className={styles.loading} role="status">
        <div className="space-y-6"><Skeleton aria-hidden="true" className="h-7 w-64 max-w-full rounded-none" /><Skeleton aria-hidden="true" className="h-80 w-full rounded-none" /></div>
        <Skeleton aria-hidden="true" className="h-64 w-full rounded-none" />
        <span className="sr-only">Loading probability calculator</span>
      </div>
    </div>
  );
}

export const LazyProbabilityCalculator = dynamic(
  () =>
    import("@/components/calculator/ProbabilityCalculator").then(
      (module) => module.ProbabilityCalculator
    ),
  {
    ssr: false,
    loading: CalculatorLoadingState
  }
);
