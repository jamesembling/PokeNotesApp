import { Card } from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";

export function LogsStatsSkeleton() {
  return (
    <div aria-label="Loading battle log totals" className="flex flex-wrap items-center gap-y-2">
      <Skeleton className="h-7 w-20" />
      <div aria-hidden="true" className="mx-5 h-5 w-px bg-border" />
      <Skeleton className="h-7 w-20" />
      <div aria-hidden="true" className="mx-5 h-5 w-px bg-border" />
      <Skeleton className="h-7 w-20" />
    </div>
  );
}

export function LogsWorkspaceSkeleton() {
  return (
    <Card aria-label="Loading battle logs" className="gap-0 p-0">
      <div className="grid gap-3 p-4 sm:p-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton className="h-20 rounded-lg" key={index} />
        ))}
      </div>
    </Card>
  );
}
