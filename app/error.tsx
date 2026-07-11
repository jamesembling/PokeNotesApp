"use client";

import { useEffect } from "react";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { Card } from "@/components/shadcn/card";
import { reportError } from "@/lib/server/report-error";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    reportError(error, { boundary: "app-error", digest: error.digest });
  }, [error]);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="ui-eyebrow">App Error</p>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.04em] text-card-foreground">
              Something went wrong while loading this page.
            </h1>
            <p className="text-sm text-foreground">
              Try the page again. If it keeps happening, report what you were doing. Include the
              error reference below if one is shown.
            </p>
          </div>

          {error.digest ? (
            <div className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground">
              Error reference: <span className="font-semibold text-card-foreground">{error.digest}</span>
            </div>
          ) : null}

          <ButtonGroup className="max-w-full flex-wrap">
            <Button onClick={reset}>Try Again</Button>
            <Button onClick={() => window.location.reload()} variant="outline">
              Reload App
            </Button>
          </ButtonGroup>
        </Card>
      </div>
    </main>
  );
}
