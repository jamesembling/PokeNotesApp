import { searchUkPlayStores } from "@/lib/locations/play-stores";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";

const MAX_QUERY_LENGTH = 120;

export async function GET(request: Request) {
  try {
    await requireApiUser();

    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (!query) {
      return privateJson({ suggestions: [] });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return privateError("Location searches must be 120 characters or fewer.", 400);
    }

    return privateJson({ suggestions: searchUkPlayStores(query, 10) });
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "getLocationSuggestions",
        area: "api",
        boundary: "location-suggestions-route",
        route: "/api/location-suggestions"
      },
      "We couldn't load location suggestions right now."
    );
  }
}
