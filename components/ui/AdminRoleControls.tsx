"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateAdminUserRoleAction } from "@/app/(admin)/admin/dashboard/actions";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import type { Role } from "@/types/index";

function RoleButton({
  currentRole,
  disabled,
  onChange,
  targetRole
}: {
  currentRole: Role;
  disabled: boolean;
  onChange: (nextRole: Role) => void;
  targetRole: Role;
}) {
  const isActive = currentRole === targetRole;

  return (
    <Button
      className="min-w-[7rem] justify-center"
      disabled={disabled || isActive}
      onClick={() => onChange(targetRole)}
      variant={isActive ? "default" : "outline"}
    >
      {targetRole === "admin" ? "Admin" : "User"}
    </Button>
  );
}

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
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleRoleChange(role: Role) {
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
    <div className="space-y-2">
      <ButtonGroup className="max-w-full flex-wrap">
        <RoleButton
          currentRole={currentRole}
          disabled={!roleUpdatesEnabled || isPending}
          onChange={handleRoleChange}
          targetRole="user"
        />
        <RoleButton
          currentRole={currentRole}
          disabled={!roleUpdatesEnabled || isPending}
          onChange={handleRoleChange}
          targetRole="admin"
        />
      </ButtonGroup>
      {feedback ? (
        <p className="text-xs text-[var(--color-loss-strong)]">{feedback}</p>
      ) : null}
    </div>
  );
}
