"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importLogAction, type ImportLogFormState } from "@/app/(app)/logs/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const INITIAL_STATE: ImportLogFormState = {
  rawLog: ""
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Importing..." : "Import Battle Log"}
    </Button>
  );
}

export function LogImportCard() {
  const [state, action] = useFormState(importLogAction, INITIAL_STATE);

  return (
    <Card className="scroll-mt-24" id="import-log">
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
            Import PTCGL Log
          </p>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Paste a raw Pokemon TCG Live battle log
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Import runs entirely on the server. The raw log is stored once, and all derived log data is written at import time.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Battle log</span>
          <textarea
            className="min-h-[16rem] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            defaultValue={state.rawLog}
            name="rawLog"
            placeholder="Paste your full PTCGL battle log here"
            spellCheck={false}
          />
        </label>

        {state.error ? (
          <p className="rounded-lg border border-[var(--color-loss)]/30 bg-[var(--color-loss)]/10 px-3 py-2 text-sm text-[var(--color-loss)]">
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-muted)]">
            Empty input, unsupported logs, missing PTCGL username, and unresolved self-player imports fail safely.
          </p>
          <SubmitButton />
        </div>
      </form>
    </Card>
  );
}
