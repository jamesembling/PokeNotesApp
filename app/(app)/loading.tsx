import { Skeleton } from "@/components/shadcn/skeleton";

function LoadingBlock({
  className
}: {
  className: string;
}) {
  return <Skeleton className={className} />;
}

export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" data-route-loading>
      <div className="flex flex-col gap-3">
        <LoadingBlock className="h-4 w-24" />
        <LoadingBlock className="h-10 w-56" />
        <LoadingBlock className="h-4 w-full max-w-xl" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <LoadingBlock className="h-24 w-full" />
          <LoadingBlock className="h-24 w-full" />
          <LoadingBlock className="h-24 w-full" />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4">
          <LoadingBlock className="h-5 w-32" />
          <LoadingBlock className="h-20 w-full" />
          <LoadingBlock className="h-20 w-full" />
          <LoadingBlock className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}
