"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  initialProfileActionState,
  saveProfileAction
} from "@/app/(app)/profile/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
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
  const [state, formAction] = useActionState(saveProfileAction, initialProfileActionState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error ? (
        <Alert
          className="border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss-strong)]"
          variant="destructive"
        >
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {state.success ? (
        <Alert className="border-[var(--color-win-border)] bg-[var(--color-win-bg)] text-[var(--color-win-strong)]">
          <AlertDescription className="text-[var(--color-win-strong)]">
            {state.success}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Display Name</span>
          <Input
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            defaultValue={profile.displayName}
            name="displayName"
            placeholder="How you want to appear in Poke Notes"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">PTCGL Username</span>
          <Input
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            defaultValue={profile.ptcglUsername}
            name="ptcglUsername"
            placeholder="Your in-game username"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">First Name</span>
          <Input
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            defaultValue={profile.firstName}
            name="firstName"
            placeholder="Optional"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Last Name</span>
          <Input
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
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
