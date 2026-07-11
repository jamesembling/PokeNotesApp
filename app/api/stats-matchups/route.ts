import { getArchetypeMatchupStats } from "@/lib/db/logs";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateJson, reportApiError } from "@/lib/server/api-response";

export async function GET() {
  try {
    const user = await requireApiUser();
    const matchups = await getArchetypeMatchupStats(user.id);

    return privateJson({ matchups });
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "getStatsMatchups",
        area: "api",
        boundary: "stats-matchups-route",
        route: "/api/stats-matchups"
      },
      "We couldn't load matchup stats right now."
    );
  }
}
