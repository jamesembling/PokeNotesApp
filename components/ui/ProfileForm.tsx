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
import { Field, FieldGroup, FieldLabel } from "@/components/shadcn/field";
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
        <Alert variant="loss">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {state.success ? (
        <Alert variant="win">
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="display-name">Display Name</FieldLabel>
          <Input
            defaultValue={profile.displayName}
            id="display-name"
            name="displayName"
            placeholder="How you want to appear in Poke Notes"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="ptcgl-username">PTCGL Username</FieldLabel>
          <Input
            defaultValue={profile.ptcglUsername}
            id="ptcgl-username"
            name="ptcglUsername"
            placeholder="Your in-game username"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="first-name">First Name</FieldLabel>
          <Input
            defaultValue={profile.firstName}
            id="first-name"
            name="firstName"
            placeholder="Optional"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="last-name">Last Name</FieldLabel>
          <Input
            defaultValue={profile.lastName}
            id="last-name"
            name="lastName"
            placeholder="Optional"
          />
        </Field>
      </FieldGroup>

      <div className="flex items-center justify-end">
        <SaveProfileButton />
      </div>
    </form>
  );
}
