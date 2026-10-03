"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { saveProfileAction, type ProfileActionState } from "@/app/(app)/profile/actions";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
import { Field, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { PageTitle, SectionTitle } from "@/components/ui/Typography";
import { ProfileAvatarChooser } from "./account/ProfileAvatarChooser";
import styles from "./account/profile.module.css";
import type { UserProfile } from "@/types/index";

const initialProfileActionState: ProfileActionState = { error: null, success: null };
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

function formatDateTime(value: string | undefined) {
  if (!value) return "Not available yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available yet" : DATE_TIME_FORMATTER.format(date);
}

export function ProfileForm({ profile, profileHref }: { profile: UserProfile; profileHref?: string }) {
  const [state, formAction, pending] = useActionState(saveProfileAction, initialProfileActionState);
  const [avatarSavePending, setAvatarSavePending] = useState(false);
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  return (
    <div className={styles.workspace}>
      <header className={styles.hero}>
        <ProfileAvatarChooser disabled={pending} onBusyChange={setAvatarSavePending} profile={profile} />
        <div className={styles.identity}>
          <PageTitle>{profile.displayName || "Your profile"}</PageTitle>
          {profile.ptcglUsername ? <p className={styles.handle}><span>PTCGL</span>{profile.ptcglUsername}</p> : null}
          {profileHref ? <Link className={styles.profileLink} href={profileHref} prefetch={false}>View my player profile</Link> : null}
        </div>
      </header>
      <div aria-label="Private account information" className={styles.account}>
        <section aria-labelledby="account-information-title">
          <SectionTitle id="account-information-title" size="sm">Account</SectionTitle>
          <dl className={styles.metadata}>
            <div><dt>Email</dt><dd>{profile.email || "Not available"}</dd></div>
            <div><dt>Name</dt><dd>{fullName || "Not set"}</dd></div>
            <div><dt>Access</dt><dd className={styles.capitalize}>{profile.role}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="activity-title">
          <SectionTitle id="activity-title" size="sm">Activity</SectionTitle>
          <dl className={styles.metadata}>
            <div><dt>Joined</dt><dd>{formatDateTime(profile.authAccountCreatedAt || profile.createdAt)}</dd></div>
            <div><dt>Last login</dt><dd>{formatDateTime(profile.lastLoginAt)}</dd></div>
            <div><dt>Last active</dt><dd>{formatDateTime(profile.lastActiveAt)}</dd></div>
          </dl>
          <p className={styles.timezone}>Times shown in London time.</p>
        </section>
      </div>
      <details className={styles.editor}>
        <summary><span>Edit account details</span><ChevronDownIcon aria-hidden="true" size={18} /></summary>
        <form action={formAction} aria-busy={pending} className={styles.form}>
          <fieldset disabled={pending || avatarSavePending}>
            <legend className="sr-only">Account details</legend>
            <div className={styles.formGroups}>
              <section aria-labelledby="account-name-title">
                <SectionTitle as="h3" id="account-name-title" size="sm">Your name</SectionTitle>
                <FieldGroup className={styles.fields}>
                  <Field className={styles.fullWidth}>
                    <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                    <Input autoComplete="nickname" defaultValue={profile.displayName} id="display-name" name="displayName" placeholder="Name shown in Poke Notes" />
                  </Field>
                  <Field><FieldLabel htmlFor="first-name">First name</FieldLabel><Input autoComplete="given-name" defaultValue={profile.firstName} id="first-name" name="firstName" placeholder="Optional" /></Field>
                  <Field><FieldLabel htmlFor="last-name">Last name</FieldLabel><Input autoComplete="family-name" defaultValue={profile.lastName} id="last-name" name="lastName" placeholder="Optional" /></Field>
                </FieldGroup>
              </section>
              <section aria-labelledby="ptcgl-details-title">
                <SectionTitle as="h3" id="ptcgl-details-title" size="sm">Pokémon TCG Live</SectionTitle>
                <p className={styles.description}>Your username identifies your side when importing Battle Logs.</p>
                <FieldGroup className={styles.fields}>
                  <Field className={styles.fullWidth}>
                    <FieldLabel htmlFor="ptcgl-username">PTCGL username</FieldLabel>
                    <Input autoCapitalize="none" defaultValue={profile.ptcglUsername} id="ptcgl-username" name="ptcglUsername" placeholder="Your in-game username" spellCheck={false} />
                  </Field>
                  <Field className={styles.fullWidth}>
                    <FieldLabel htmlFor="ptcgl-username-aliases">Alternate PTCGL usernames</FieldLabel>
                    <Input aria-describedby="ptcgl-aliases-help" autoCapitalize="none" defaultValue={profile.ptcglUsernameAliases.join(", ")} id="ptcgl-username-aliases" name="ptcglUsernameAliases" placeholder="Previous in-game usernames" spellCheck={false} />
                    <p className={styles.description} id="ptcgl-aliases-help">Separate multiple usernames with commas. Imported logs display your primary username.</p>
                  </Field>
                </FieldGroup>
              </section>
            </div>
            <div className={styles.saveRow}>
              <div className={styles.saveStatus}>{state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}{state.success ? <p role="status">{state.success}</p> : null}</div>
              <Button disabled={pending || avatarSavePending} type="submit">{pending ? "Saving…" : "Save Profile"}</Button>
            </div>
          </fieldset>
        </form>
      </details>
    </div>
  );
}
