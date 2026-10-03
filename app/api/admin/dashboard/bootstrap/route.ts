import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";
import { requireApiUser } from "@/lib/server/api-auth";
import {
  getAdminAccessContext,
  getAdminDashboardOverview,
  getAdminUsers
} from "@/lib/db/admin";
import { measureServerCallWithTimeline, takeServerRuntimeSnapshot } from "@/lib/server/perf";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const requestStartedAt = Date.now();
  const runtime = takeServerRuntimeSnapshot();

  try {
    const accessTiming = await measureServerCallWithTimeline(
      "api.admin.dashboard.bootstrap.access",
      async () => {
        await requireApiUser();
        return await getAdminAccessContext();
      }
    );
    const { profile, role } = accessTiming.value;

    if (role !== "admin") {
      return privateError("Administrator access required.", 403);
    }

    const [overviewTiming, usersTiming] = await Promise.all([
      measureServerCallWithTimeline("api.admin.dashboard.bootstrap.overview", () =>
        getAdminDashboardOverview()
      ),
      measureServerCallWithTimeline("api.admin.dashboard.bootstrap.users", () => getAdminUsers())
    ]);

    return privateJson(
      {
        diagnostics: {
          accessEndedMs: Math.max(0, accessTiming.endedAtEpochMs - requestStartedAt),
          accessMs: accessTiming.durationMs,
          accessStartedMs: Math.max(0, accessTiming.startedAtEpochMs - requestStartedAt),
          overviewEndedMs: Math.max(0, overviewTiming.endedAtEpochMs - requestStartedAt),
          overviewMs: overviewTiming.durationMs,
          overviewStartedMs: Math.max(0, overviewTiming.startedAtEpochMs - requestStartedAt),
          runtimeBootAgeMs: runtime.bootAgeMs,
          runtimeBootId: runtime.bootId,
          runtimeInvocationOrdinal: runtime.invocationOrdinal,
          runtimeRegion: process.env.VERCEL_REGION || process.env.VERCEL_FUNCTION_REGION || null,
          usersEndedMs: Math.max(0, usersTiming.endedAtEpochMs - requestStartedAt),
          usersMs: usersTiming.durationMs,
          usersStartedMs: Math.max(0, usersTiming.startedAtEpochMs - requestStartedAt)
        },
        overview: overviewTiming.value,
        profile: {
          avatarColor: profile.avatarColor,
          avatarUrl: profile.avatarUrl,
          displayName: profile.displayName,
          email: profile.email,
          isAdmin: true
        },
        users: usersTiming.value
      },
      {
        headers: {
          "Server-Timing": [
            `admin-access;dur=${accessTiming.durationMs}`,
            `admin-overview;dur=${overviewTiming.durationMs}`,
            `admin-users;dur=${usersTiming.durationMs}`
          ].join(", ")
        }
      }
    );
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "loadAdminDashboardBootstrap",
        area: "admin",
        boundary: "admin-dashboard-bootstrap-route",
        route: "/api/admin/dashboard/bootstrap"
      },
      "Could not load the admin dashboard."
    );
  }
}
