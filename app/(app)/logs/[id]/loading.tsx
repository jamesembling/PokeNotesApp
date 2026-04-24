import { Card } from "@/components/ui/Card";

function LoadingBlock({ className }: { className: string }) {
  return (
    <div
      className={["animate-pulse rounded-xl bg-[var(--bg-surface-alt)]", className].join(" ")}
    />
  );
}

export default function LogDetailLoading() {
  return (
    <div className="flex flex-col gap-6" data-route-loading>
      <div className="flex flex-col gap-3">
        <LoadingBlock className="h-4 w-32" />
        <LoadingBlock className="h-10 w-72" />
      </div>

      <Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <LoadingBlock className="h-20 w-full" />
          <LoadingBlock className="h-20 w-full" />
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LoadingBlock className="h-24 w-full" />
          <LoadingBlock className="h-24 w-full" />
          <LoadingBlock className="h-24 w-full" />
          <LoadingBlock className="h-24 w-full" />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <LoadingBlock className="h-6 w-32" />
          <LoadingBlock className="h-20 w-full" />
          <LoadingBlock className="h-20 w-full" />
          <LoadingBlock className="h-20 w-full" />
        </div>
      </Card>
    </div>
  );
}
