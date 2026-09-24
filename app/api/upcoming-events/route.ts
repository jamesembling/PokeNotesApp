import { getUpcomingLimitlessEvents } from "@/lib/tournaments/limitless-upcoming";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateJson, reportApiError } from "@/lib/server/api-response";

export async function GET() {
  try {
    await requireApiUser();
    return privateJson(await getUpcomingLimitlessEvents());
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "loadUpcomingEvents",
        area: "api",
        boundary: "upcoming-events-route",
        route: "/api/upcoming-events"
      },
      "Could not load upcoming events."
    );
  }
}
