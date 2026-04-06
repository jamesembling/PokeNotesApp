import { Card } from "@/components/ui/Card";

function LoadingBlock({
  className,
  style
}: {
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={["animate-pulse rounded-xl bg-[var(--bg-surface-alt)]", className].join(" ")}
      style={style}
    />
  );
}

export default function DeckListLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <LoadingBlock className="h-4 w-40" />
        <LoadingBlock className="h-10 w-64" />
      </div>

      <Card className="space-y-4">
        <LoadingBlock className="h-4 w-24" />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 24 }).map((_, index) => (
            <LoadingBlock className="w-full" key={index} style={{ aspectRatio: "0.715" }} />
          ))}
        </div>
      </Card>
    </div>
  );
}
