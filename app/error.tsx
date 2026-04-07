"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
              App Error
            </p>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Something went wrong while loading this page.
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Try reloading the route. If this keeps happening, the error details below will help us
              trace it quickly.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
            {error.message || "Unknown error"}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={reset}>Try Again</Button>
            <Button onClick={() => window.location.reload()} variant="secondary">
              Reload App
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
