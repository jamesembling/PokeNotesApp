import { requireApiUser } from "@/lib/server/api-auth";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireApiUser();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_incoming_friend_request_count");
    if (error) {
      if (error.code === "PGRST202" && /\b(?:public\.)?get_incoming_friend_request_count\b/.test(error.message)) {
        return privateError("Friend request notifications are temporarily unavailable. Try again shortly.", 503);
      }
      throw error;
    }
    if (!Number.isSafeInteger(data) || data < 0) throw new Error("Invalid incoming friend request count.");
    return privateJson({ count: data });
  } catch (error) {
    return reportApiError(error, {
      boundary: "incoming-friend-request-count",
      route: "/api/friend-requests/count"
    }, "Unable to load friend request notifications. Try again.");
  }
}
