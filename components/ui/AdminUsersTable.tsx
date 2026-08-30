import { AdminRoleControls } from "@/components/ui/AdminRoleControls";
import { ItemTitle } from "@/components/ui/Typography";
import type { AdminUser } from "@/types/index";
import styles from "./admin/admin.module.css";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});
const COUNT_FORMATTER = new Intl.NumberFormat("en-GB");

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
    <div className={styles.userLedger}>
      {warning ? <p className={styles.notice} role="alert">{warning}</p> : null}

      {users.length === 0 ? (
        <p className={styles.empty}>No accounts to display.</p>
      ) : (
        <table aria-label="Accounts and roles" className={styles.table} role="table">
          <colgroup>
            <col className={styles.userColumn} />
            <col className={styles.ptcglColumn} />
            <col className={styles.activityColumn} />
            <col className={styles.countColumn} span={4} />
            <col className={styles.roleColumn} />
          </colgroup>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">User</th>
              <th role="columnheader" scope="col">PTCGL</th>
              <th role="columnheader" scope="col">Activity</th>
              <th className={styles.countHeading} role="columnheader" scope="col">Deck Strategies</th>
              <th className={styles.countHeading} role="columnheader" scope="col">Deck Lists</th>
              <th className={styles.countHeading} role="columnheader" scope="col">Tournaments</th>
              <th className={styles.countHeading} role="columnheader" scope="col">Battle Logs</th>
              <th role="columnheader" scope="col">Access</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {users.map((user) => (
              <tr key={user.id} role="row">
                <td className={styles.identityCell} role="cell">
                  <ItemTitle as="p" size="sm">{user.displayName || "Unnamed user"}</ItemTitle>
                  <p className={styles.email}>{user.email}</p>
                </td>
                <td className={styles.ptcglCell} role="cell">
                  <span aria-hidden="true" className={styles.mobileLabel}>PTCGL</span>
                  <p>{user.ptcglUsername || "Not set"}</p>
                </td>
                <td className={styles.activityCell} role="cell">
                  <span aria-hidden="true" className={styles.mobileLabel}>Activity</span>
                  <dl className={styles.activity}>
                    <div>
                      <dt>Last activity</dt>
                      <dd>{formatDateTime(user.lastActivityAt)}</dd>
                    </div>
                    <div>
                      <dt>Last login</dt>
                      <dd>{formatDateTime(user.lastLoginAt)}</dd>
                    </div>
                  </dl>
                </td>
                <CountCell count={user.deckCount} label="Deck Strategies" />
                <CountCell count={user.deckListCount} label="Deck Lists" />
                <CountCell count={user.tournamentCount} label="Tournaments" />
                <CountCell count={user.logCount} label="Battle Logs" />
                <td className={styles.roleCell} role="cell">
                  <span aria-hidden="true" className={styles.mobileLabel}>Access</span>
                  <AdminRoleControls
                    currentRole={user.role}
                    roleUpdatesEnabled={roleUpdatesEnabled}
                    userLabel={user.displayName || user.email}
                    userId={user.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CountCell({ count, label }: { count: number; label: string }) {
  return (
    <td className={styles.countCell} role="cell">
      <span className={styles.countValue}>{COUNT_FORMATTER.format(count)}</span>
      <span aria-hidden="true" className={styles.countLabel}>{label}</span>
    </td>
  );
}
