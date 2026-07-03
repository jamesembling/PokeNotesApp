"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { updateAdminUserRoleAction } from "@/app/(admin)/admin/dashboard/actions";
import { Switch } from "@/components/shadcn/switch";
import type { Role } from "@/types/index";

export function AdminRoleControls({
  currentRole,
  roleUpdatesEnabled,
  userId
}: {
  currentRole: Role;
  roleUpdatesEnabled: boolean;
  userId: string;
}) {
  const router = useRouter();
  const adminSwitchId = useId();
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
          aria-label="Admin role"
          checked={isAdmin}
          disabled={disabled}
          id={adminSwitchId}
          onCheckedChange={(checked) => handleRoleChange(checked ? "admin" : "user")}
        />
      </div>
      {feedback ? (
        <p className="text-xs text-loss">{feedback}</p>
      ) : null}
    </div>
  );
}
