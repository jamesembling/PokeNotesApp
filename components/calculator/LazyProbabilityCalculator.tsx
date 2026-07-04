"use client";

import dynamic from "next/dynamic";

export const LazyProbabilityCalculator = dynamic(
  () =>
    import("@/components/calculator/ProbabilityCalculator").then(
      (module) => module.ProbabilityCalculator
    ),
  {
    ssr: false,
    loading: () => null
  }
);
