import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { AdminRoleControls } from "@/components/ui/AdminRoleControls";
import type { AdminUser } from "@/types/index";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});

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
    return DATE_TIME_FORMATTER.format(new Date(value));
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

      <div className="grid gap-0 lg:hidden">
        {users.map((user) => (
          <section className="border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0" key={user.id}>
            <div className="min-w-0 space-y-1">
              <h3 className="break-words text-sm font-semibold text-card-foreground">
                {user.displayName || "Unnamed user"}
              </h3>
              <p className="break-words text-sm text-muted-foreground">{user.email}</p>
            </div>

            <dl className="mt-4 grid gap-3 text-sm">
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                <dt className="ui-eyebrow pt-0.5 text-[0.65rem]">PTCGL</dt>
                <dd className="min-w-0 break-words text-right text-card-foreground">
                  {user.ptcglUsername || "Not set"}
                </dd>
              </div>

              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                <dt className="ui-eyebrow pt-0.5 text-[0.65rem]">Activity</dt>
                <dd className="min-w-0 space-y-1 text-right text-card-foreground">
                  <p>Last activity: {formatDateTime(user.lastActivityAt)}</p>
                  <p>Last login: {formatDateTime(user.lastLoginAt)}</p>
                </dd>
              </div>

              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                <dt className="ui-eyebrow pt-0.5 text-[0.65rem]">Content</dt>
                <dd className="min-w-0 text-right text-card-foreground">
                  <p>
                    {user.deckCount} decks, {user.deckListCount} lists
                  </p>
                  <p>
                    {user.tournamentCount} tournaments, {user.logCount} logs
                  </p>
                </dd>
              </div>

              <div className="grid gap-2">
                <dt className="ui-eyebrow text-[0.65rem]">Admin</dt>
                <dd className="min-w-0">
                  <AdminRoleControls
                    currentRole={user.role}
                    roleUpdatesEnabled={roleUpdatesEnabled}
                    userId={user.id}
                  />
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>

      <div className="hidden lg:block">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <th className="border-b border-border p-3 font-semibold">User</th>
              <th className="border-b border-border p-3 font-semibold">PTCGL</th>
              <th className="border-b border-border p-3 font-semibold">Activity</th>
              <th className="border-b border-border p-3 font-semibold">Content</th>
              <th className="border-b border-border p-3 font-semibold">Admin</th>
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
                    <p>Last activity: {formatDateTime(user.lastActivityAt)}</p>
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
