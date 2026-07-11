"use client";

import dynamic from "next/dynamic";
import { Card } from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";

function CalculatorLoadingState() {
  return (
    <Card aria-label="Loading probability calculator" className="grid gap-4" role="status">
      <Skeleton aria-hidden="true" className="h-8 w-56 max-w-full" />
      <Skeleton aria-hidden="true" className="h-64 w-full" />
      <span className="sr-only">Loading probability calculator</span>
    </Card>
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
