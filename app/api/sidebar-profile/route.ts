import { cookies } from "next/headers";
import { after } from "next/server";
import { getCurrentSidebarProfile } from "@/lib/db/profile";
import { normalizeAvatarColor, PROFILE_AVATAR_COOKIE } from "@/lib/profile-avatar";
import { privateJson, reportApiError } from "@/lib/server/api-response";
import { requireApiUser } from "@/lib/server/api-auth";
import { measureServerCallWithTiming } from "@/lib/server/perf";
import { warmBattleLogImportContext } from "@/lib/server/battle-log-import-context-cache";
import { reportError } from "@/lib/server/report-error";

export async function GET() {
  try {
    const user = await requireApiUser();
    const importContextWarm = warmBattleLogImportContext(user.id).catch((error) => {
      reportError(error, {
        action: "warmBattleLogImportContext",
        area: "api",
        boundary: "sidebar-profile-import-context-warm",
        route: "/api/sidebar-profile"
      });
    });
    after(() => importContextWarm);
    const [profileTiming, cookieStore] = await Promise.all([
      measureServerCallWithTiming("api.sidebarProfile.profile", () => getCurrentSidebarProfile()),
      cookies()
    ]);
    const profile = profileTiming.value;

    return privateJson(
      {
        durationMs: profileTiming.durationMs,
        profile: {
          avatarColor: normalizeAvatarColor(
            cookieStore.get(PROFILE_AVATAR_COOKIE)?.value || profile.avatarColor
          ),
          avatarUrl: profile.avatarUrl,
          displayName: profile.displayName,
          email: profile.email,
          isAdmin: profile.role === "admin"
        }
      },
      {
        headers: {
          "Server-Timing": `shell-profile;dur=${profileTiming.durationMs}`
        }
      }
    );
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "loadSidebarProfile",
        area: "api",
        boundary: "sidebar-profile-route",
        route: "/api/sidebar-profile"
      },
      "Could not load your sidebar profile."
    );
  }
}
