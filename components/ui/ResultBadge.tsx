import { Badge } from "@/components/ui/Badge";

type ResultBadgeProps = {
  result: "Win" | "Loss";
};

export function ResultBadge({ result }: ResultBadgeProps) {
  return <Badge variant={result === "Win" ? "win" : "loss"}>{result}</Badge>;
}
