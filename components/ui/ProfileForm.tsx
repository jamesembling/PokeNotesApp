"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  saveProfileAction,
  saveProfileAvatarAction,
  type ProfileActionState
} from "@/app/(app)/profile/actions";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
import { Field, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";
import { SectionTitle } from "@/components/ui/Typography";
import styles from "./account/profile.module.css";
import { AVATAR_COLORS } from "@/lib/profile-avatar";
import type { AvatarColor, UserProfile } from "@/types/index";

type ProfileFormProps = {
  profile: UserProfile;
};

const initialProfileActionState: ProfileActionState = {
  error: null,
  success: null
};

function SaveProfileButton({ avatarSavePending }: { avatarSavePending: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending || avatarSavePending} type="submit">
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
    <form action={formAction} className={styles.form}>
      <section aria-labelledby="account-details-title">
        <SectionTitle id="account-details-title" size="sm">Account details</SectionTitle>
        <p className={styles.description}>
          Your PTCGL username identifies your side when importing Battle Logs.
        </p>
        <FieldGroup className={styles.fields}>
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
              autoCapitalize="none"
              spellCheck={false}
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

        <div className={styles.saveRow}>
          <div className={styles.saveStatus}>
            {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
            {state.success ? <p role="status">{state.success}</p> : null}
          </div>
          <SaveProfileButton avatarSavePending={avatarSavePending} />
        </div>
      </section>

      <section aria-labelledby="profile-picture-title" className={styles.avatarSection}>
        <SectionTitle id="profile-picture-title" size="sm">Profile picture</SectionTitle>
        <p className={styles.description}>Choose a colour. Your profile picture saves automatically.</p>
        {avatarError ? (
          <p className={`${styles.saveStatus} ${styles.error}`} role="alert">{avatarError}</p>
        ) : null}
        <fieldset
          aria-busy={avatarSavePending}
          className={styles.avatarChoices}
        >
          <legend className="sr-only">Choose a profile picture colour</legend>
          {AVATAR_COLORS.map((avatarColor) => (
            <label
              className={styles.avatarChoice}
              key={avatarColor}
            >
              <input
                checked={selectedAvatarColor === avatarColor}
                className="sr-only"
                disabled={avatarSavePending}
                name="avatarColor"
                onChange={() => handleAvatarColorChange(avatarColor)}
                type="radio"
                value={avatarColor}
              />
              <span className={styles.avatarRing}>
                <ProfileAvatar
                  avatarColor={avatarColor}
                  className="size-10"
                  fallback={profile.displayName.slice(0, 2).toUpperCase()}
                />
              </span>
              <span>{avatarColor}</span>
            </label>
          ))}
        </fieldset>
        <p className={styles.avatarStatus} role="status">
          {avatarSavePending ? "Saving colour..." : `${selectedAvatarColor.charAt(0).toUpperCase()}${selectedAvatarColor.slice(1)} selected`}
        </p>
      </section>
    </form>
  );
}
