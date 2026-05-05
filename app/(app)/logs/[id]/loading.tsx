import { Skeleton } from "@/components/shadcn/skeleton";

export default function LogDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8" data-route-loading>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-28" />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
