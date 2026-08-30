import { Skeleton } from "@/components/shadcn/skeleton";

export function DecksLoadingState() {
  return (
    <div
      aria-busy="true"
      className="flex flex-col gap-6"
      data-route-loading
      role="status"
    >
      <span className="sr-only">Loading deck strategy</span>
      <header className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-[22rem] max-w-full" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </header>
      <div className="grid gap-5">
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <Skeleton className="h-10 w-32 rounded-lg sm:hidden" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton className="h-36 rounded-lg border border-border" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
