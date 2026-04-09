"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  initialProfileActionState,
  saveProfileAction
} from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/Button";
import type { UserProfile } from "@/types/index";

type ProfileFormProps = {
  profile: UserProfile;
};

function SaveProfileButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? "Saving..." : "Save Profile"}
    </Button>
  );
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const [state, formAction] = useFormState(saveProfileAction, initialProfileActionState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error ? (
        <p className="rounded-lg border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss-strong)]">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded-lg border border-[var(--color-win-border)] bg-[var(--color-win-bg)] px-4 py-3 text-sm text-[var(--color-win-strong)]">
          {state.success}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Display Name</span>
          <input
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            defaultValue={profile.displayName}
            name="displayName"
            placeholder="How you want to appear in Poke Notes"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">PTCGL Username</span>
          <input
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            defaultValue={profile.ptcglUsername}
            name="ptcglUsername"
            placeholder="Your in-game username"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">First Name</span>
          <input
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            defaultValue={profile.firstName}
            name="firstName"
            placeholder="Optional"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Last Name</span>
          <input
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            defaultValue={profile.lastName}
            name="lastName"
            placeholder="Optional"
          />
        </label>
      </div>

      <div className="flex items-center justify-end">
        <SaveProfileButton />
      </div>
    </form>
  );
}
