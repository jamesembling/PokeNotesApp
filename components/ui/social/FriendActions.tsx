"use client";

import { useActionState } from "react";
import Link from "next/link";
import { friendshipAction } from "@/app/(app)/friends/actions";
import { Button } from "@/components/shadcn/button";
import type { SocialProfile } from "@/lib/social/types";
import styles from "./social.module.css";

export function FriendActions({ profile, canConnect }: { profile: SocialProfile; canConnect: boolean }) {
  const [state, action, pending] = useActionState(friendshipAction, {});
  if (profile.relationship === "self") return null;

  const actions = profile.relationship === "friends"
    ? [{ operation: "remove", label: "Remove friend" }]
    : profile.relationship === "incoming"
      ? [{ operation: "accept", label: "Accept request" }, { operation: "decline", label: "Decline" }]
      : profile.relationship === "outgoing"
        ? [{ operation: "cancel", label: "Cancel request" }]
        : profile.relationship === "blocked"
          ? [{ operation: "unblock", label: "Unblock" }]
          : [{ operation: "request", label: "Add friend" }];

  return (
    <form action={action} aria-busy={pending} className={styles.actionForm}>
      <input name="targetUserId" type="hidden" value={profile.id} />
      <div className={styles.actions}>
        {actions.map(({ operation, label }) => (
          <Button aria-label={`${label}: ${profile.trainerName}`} disabled={pending || (!canConnect && (operation === "request" || operation === "accept"))} key={operation} name="operation" type="submit" value={operation} variant="outline">
            {pending ? "Updating…" : label}
          </Button>
        ))}
        {profile.relationship !== "blocked" ? (
          <details>
            <summary className="cursor-pointer px-2 py-2 text-sm text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">More</summary>
            <Button aria-label={`Block ${profile.trainerName}`} disabled={pending} name="operation" type="submit" value="block" variant="ghost">Block player</Button>
          </details>
        ) : null}
      </div>
      {!canConnect && actions.some(({ operation }) => operation === "request" || operation === "accept") ? <p className={styles.meta}><Link className="underline underline-offset-4" href="/profile" prefetch={false}>Enable your player profile</Link> to connect.</p> : null}
      {state.error ? <p className={`${styles.status} ${styles.error}`} role="alert">{state.error}</p> : null}
      {state.success ? <p className={styles.status} role="status">{state.success}</p> : null}
    </form>
  );
}
