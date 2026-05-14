import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getArchetypeMatchupStats } from "@/lib/db/logs";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";
import { reportError } from "@/lib/server/report-error";

export async function GET() {
  try {
    const user = await requireUser();
    const matchups = await getArchetypeMatchupStats(user.id);

    return NextResponse.json({ matchups }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    reportError(error, {
      action: "getStatsMatchups",
      area: "api",
      boundary: "stats-matchups-route",
      route: "/api/stats-matchups"
    });

    return NextResponse.json(
      { error: "We couldn't load matchup stats right now." },
      { headers: PRIVATE_NO_STORE_HEADERS, status: 500 }
    );
  }
}
