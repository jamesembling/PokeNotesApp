import { searchCardArtPrints } from "@/lib/social/card-art";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateJson, reportApiError } from "@/lib/server/api-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireApiUser();
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const options = await searchCardArtPrints(query);
    return privateJson({ options: options.slice(0, 60) });
  } catch (error) {
    return reportApiError(error, { boundary: "card-art-options-route", route: "/api/card-art-options" }, "We couldn't load card artworks. Try searching again.");
  }
}
