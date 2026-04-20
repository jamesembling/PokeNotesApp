import { LazyProbabilityCalculator } from "@/components/calculator/LazyProbabilityCalculator";
import { PageHeader } from "@/components/ui/PageHeader";

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
      />
      <LazyProbabilityCalculator />
    </>
  );
}
