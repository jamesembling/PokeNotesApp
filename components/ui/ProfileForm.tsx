"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  saveProfileAction,
  saveProfileAvatarAction,
  type ProfileActionState
} from "@/app/(app)/profile/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
import { Field, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";
import { AVATAR_COLORS } from "@/lib/profile-avatar";
import type { AvatarColor, UserProfile } from "@/types/index";

type ProfileFormProps = {
  profile: UserProfile;
};

const initialProfileActionState: ProfileActionState = {
  error: null,
  success: null
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
  const [selectedAvatarColor, setSelectedAvatarColor] = useState<AvatarColor>(profile.avatarColor);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSavePending, startAvatarSaveTransition] = useTransition();
  const router = useRouter();

  function handleAvatarColorChange(avatarColor: AvatarColor) {
    const previousAvatarColor = selectedAvatarColor;

    setSelectedAvatarColor(avatarColor);
    setAvatarError(null);

    startAvatarSaveTransition(async () => {
      const result = await saveProfileAvatarAction(avatarColor);

      if (result.error || !result.avatarColor) {
        setSelectedAvatarColor(previousAvatarColor);
        setAvatarError(result.error || "Unable to save your profile picture right now.");
        return;
      }

      setSelectedAvatarColor(result.avatarColor);
      router.refresh();
    });
  }

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

      <Field>
        <FieldLabel>Profile Picture</FieldLabel>
        {avatarError ? (
          <Alert variant="loss">
            <AlertDescription>{avatarError}</AlertDescription>
          </Alert>
        ) : null}
        <div
          aria-busy={avatarSavePending}
          className="grid grid-cols-4 gap-3 sm:grid-cols-8"
        >
          {AVATAR_COLORS.map((avatarColor) => (
            <label
              className="group relative flex cursor-pointer flex-col items-center gap-2 text-xs capitalize text-muted-foreground transition-colors hover:text-foreground has-[:disabled]:cursor-wait has-[:disabled]:opacity-60"
              key={avatarColor}
            >
              <input
                checked={selectedAvatarColor === avatarColor}
                className="peer sr-only"
                disabled={avatarSavePending}
                name="avatarColor"
                onChange={() => handleAvatarColorChange(avatarColor)}
                type="radio"
                value={avatarColor}
              />
              <span className="rounded-full p-0.5 transition peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <ProfileAvatar
                  avatarColor={avatarColor}
                  className="size-10"
                  fallback={profile.displayName.slice(0, 2).toUpperCase()}
                />
              </span>
              <span>{avatarColor}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="flex items-center justify-end">
        <SaveProfileButton />
      </div>
    </form>
  );
}
