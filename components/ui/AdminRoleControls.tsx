"use client";

import { useId, useState, useTransition } from "react";
import { updateAdminUserRoleAction } from "@/app/(admin)/admin/dashboard/actions";
import { Switch } from "@/components/shadcn/switch";
import type { Role } from "@/types/index";
import styles from "./admin/admin.module.css";

export function AdminRoleControls({
  currentRole,
  roleUpdatesEnabled,
  userLabel,
  userId
}: {
  currentRole: Role;
  roleUpdatesEnabled: boolean;
  userLabel: string;
  userId: string;
}) {
  const adminSwitchId = useId();
  const feedbackId = `${adminSwitchId}-feedback`;
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const isAdmin = currentRole === "admin";
  const disabled = !roleUpdatesEnabled || isPending;

  function handleRoleChange(role: Role) {
    if (role === currentRole) {
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await updateAdminUserRoleAction({ userId, role });

      if (!result.ok) {
        setFeedback(result.error);
        return;
      }

      window.dispatchEvent(new CustomEvent("pokenotes:admin-dashboard-refresh"));
    });
  }

  return (
    <div className={styles.roleControl}>
      <label className={styles.roleLabel} htmlFor={adminSwitchId}>
        <Switch
          aria-describedby={feedback ? feedbackId : undefined}
          aria-label={`Admin role for ${userLabel}`}
          checked={isAdmin}
          disabled={disabled}
          id={adminSwitchId}
          onCheckedChange={(checked) => handleRoleChange(checked ? "admin" : "user")}
        />
        <span>{isAdmin ? "Admin" : "User"}</span>
      </label>
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {isPending ? "Updating admin role..." : ""}
      </p>
      {feedback ? (
        <p
          aria-atomic="true"
          aria-live="assertive"
          className={styles.roleFeedback}
          id={feedbackId}
          role="alert"
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
