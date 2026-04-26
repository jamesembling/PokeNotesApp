export default function LogDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8" data-route-loading>
      <div className="flex flex-col gap-3">
        <div className="h-4 w-44 animate-pulse rounded bg-[var(--bg-surface-alt)]" />
        <div className="h-8 w-28 animate-pulse rounded bg-[var(--bg-surface-alt)]" />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-24 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
          <div className="h-24 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="h-20 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
          <div className="h-20 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
          <div className="h-20 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
          <div className="h-20 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
        </div>
      </div>
    </div>
  );
}
