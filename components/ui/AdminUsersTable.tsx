"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateAdminUserRoleAction } from "@/app/(admin)/admin/dashboard/actions";
import { Button } from "@/components/ui/Button";
import type { AdminUser, Role } from "@/types/index";

type AdminUsersTableProps = {
  roleUpdatesEnabled: boolean;
  users: AdminUser[];
  warning?: string;
};

function formatDateTime(value: string | undefined) {
  if (!value) {
    return "Not available yet";
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

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
      variant={isActive ? "primary" : "secondary"}
    >
      {targetRole === "admin" ? "Admin" : "User"}
    </Button>
  );
}

export function AdminUsersTable({
  roleUpdatesEnabled,
  users,
  warning
}: AdminUsersTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleRoleChange(userId: string, role: Role) {
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
    <div className="space-y-4">
      {warning ? (
        <p className="rounded-lg border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss-strong)]">
          {warning}
        </p>
      ) : null}

      {feedback ? (
        <p className="rounded-lg border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss-strong)]">
          {feedback}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
              <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">User</th>
              <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">PTCGL</th>
              <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Activity</th>
              <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Content</th>
              <th className="border-b border-[var(--border)] px-3 py-3 font-semibold">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="align-top" key={user.id}>
                <td className="border-b border-[var(--border)] px-3 py-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {user.displayName || "Unnamed user"}
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">{user.email}</p>
                  </div>
                </td>
                <td className="border-b border-[var(--border)] px-3 py-4 text-sm text-[var(--text-secondary)]">
                  {user.ptcglUsername || "Not set"}
                </td>
                <td className="border-b border-[var(--border)] px-3 py-4">
                  <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                    <p>Last active: {formatDateTime(user.lastActiveAt)}</p>
                    <p>Last login: {formatDateTime(user.lastLoginAt)}</p>
                    <p>Logins: {user.loginCount}</p>
                  </div>
                </td>
                <td className="border-b border-[var(--border)] px-3 py-4">
                  <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                    <p>Decks: {user.deckCount}</p>
                    <p>Logs: {user.logCount}</p>
                  </div>
                </td>
                <td className="border-b border-[var(--border)] px-3 py-4">
                  <div className="flex flex-wrap gap-2">
                    <RoleButton
                      currentRole={user.role}
                      disabled={!roleUpdatesEnabled || isPending}
                      onChange={(nextRole) => handleRoleChange(user.id, nextRole)}
                      targetRole="user"
                    />
                    <RoleButton
                      currentRole={user.role}
                      disabled={!roleUpdatesEnabled || isPending}
                      onChange={(nextRole) => handleRoleChange(user.id, nextRole)}
                      targetRole="admin"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
