import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/PageHeader";

const ProbabilityCalculator = dynamic(
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

export default async function CalculatorPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Probability Calculator" }
        ]}
        showDivider={false}
        title="Probability Calculator"
        subtitle="Paste a Limitless decklist to view setup odds, prizing odds, mulligan streaks, and card visuals."
      />
      <ProbabilityCalculator />
    </>
  );
}
