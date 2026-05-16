import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { AdminRoleControls } from "@/components/ui/AdminRoleControls";
import type { AdminUser } from "@/types/index";

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

export function AdminUsersTable({
  roleUpdatesEnabled,
  users,
  warning
}: AdminUsersTableProps) {
  return (
    <div className="space-y-4">
      {warning ? (
        <Alert
          className="border-loss-border bg-loss-bg text-loss"
          variant="destructive"
        >
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <th className="border-b border-border px-3 py-3 font-semibold">User</th>
              <th className="border-b border-border px-3 py-3 font-semibold">PTCGL</th>
              <th className="border-b border-border px-3 py-3 font-semibold">Activity</th>
              <th className="border-b border-border px-3 py-3 font-semibold">Content</th>
              <th className="border-b border-border px-3 py-3 font-semibold">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="align-top" key={user.id}>
                <td className="border-b border-border px-3 py-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-card-foreground">
                      {user.displayName || "Unnamed user"}
                    </p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </td>
                <td className="border-b border-border px-3 py-4 text-sm text-foreground">
                  {user.ptcglUsername || "Not set"}
                </td>
                <td className="border-b border-border px-3 py-4">
                  <div className="space-y-1 text-sm text-foreground">
                    <p>Last active: {formatDateTime(user.lastActiveAt)}</p>
                    <p>Last login: {formatDateTime(user.lastLoginAt)}</p>
                  </div>
                </td>
                <td className="border-b border-border px-3 py-4">
                  <div className="space-y-1 text-sm text-foreground">
                    <p>Decks: {user.deckCount}</p>
                    <p>Deck Lists: {user.deckListCount}</p>
                    <p>Tournaments: {user.tournamentCount}</p>
                    <p>Logs: {user.logCount}</p>
                  </div>
                </td>
                <td className="border-b border-border px-3 py-4">
                  <AdminRoleControls
                    currentRole={user.role}
                    roleUpdatesEnabled={roleUpdatesEnabled}
                    userId={user.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
