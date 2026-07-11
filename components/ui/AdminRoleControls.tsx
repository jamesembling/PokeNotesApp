"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { updateAdminUserRoleAction } from "@/app/(admin)/admin/dashboard/actions";
import { Switch } from "@/components/shadcn/switch";
import type { Role } from "@/types/index";

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
  const router = useRouter();
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

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Switch
          aria-describedby={feedback ? feedbackId : undefined}
          aria-label={`Admin role for ${userLabel}`}
          checked={isAdmin}
          disabled={disabled}
          id={adminSwitchId}
          onCheckedChange={(checked) => handleRoleChange(checked ? "admin" : "user")}
        />
      </div>
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {isPending ? "Updating admin role..." : ""}
      </p>
      {feedback ? (
        <p
          aria-atomic="true"
          aria-live="assertive"
          className="text-xs text-loss-strong"
          id={feedbackId}
          role="alert"
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
