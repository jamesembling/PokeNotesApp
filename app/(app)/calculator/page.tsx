import { LazyProbabilityCalculator } from "@/components/calculator/LazyProbabilityCalculator";
import { ProxyAuthTimingMarker } from "@/components/ui/RouteTimingMarker";

export default function CalculatorPage() {
  return (
    <>
      <ProxyAuthTimingMarker />
      <LazyProbabilityCalculator />
    </>
  );
}
