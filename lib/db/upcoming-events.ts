import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  defaultEventFilters,
  isUpcomingLimitlessEvent,
  withinUpcomingWindow,
  type EventFilters,
  type UpcomingLimitlessEvent
} from "@/lib/tournaments/limitless-events";

export type UserEventState = {
  filters: EventFilters;
  pins: UpcomingLimitlessEvent[];
};

export async function getUserEventState(userId: string): Promise<UserEventState> {
  const supabase = await createClient();
  const [preferences, pins] = await Promise.all([
    supabase.from("user_event_preferences")
      .select("search_query,starts_after,starts_before")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("user_event_pins")
      .select("event_snapshot")
      .eq("user_id", userId)
      .order("pinned_at", { ascending: false })
      .limit(100)
  ]);
  if (preferences.error) throw preferences.error;
  if (pins.error) throw pins.error;

  return {
    filters: preferences.data ? {
      query: preferences.data.search_query,
      from: preferences.data.starts_after,
      to: preferences.data.starts_before
    } : defaultEventFilters,
    pins: (pins.data ?? [])
      .map((row) => row.event_snapshot)
      .filter(isUpcomingLimitlessEvent)
      .filter((event) => withinUpcomingWindow(event))
  };
}
