"use server";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isUpcomingLimitlessEvent,
  withinUpcomingWindow,
  type EventFilters,
  type UpcomingLimitlessEvent
} from "@/lib/tournaments/limitless-events";
import type { Json } from "@/types/supabase";

const TIME_PATTERN = /^$|^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export async function saveEventFilters(filters: EventFilters) {
  if (!filters || typeof filters.query !== "string" || filters.query.length > 120
    || typeof filters.from !== "string" || !TIME_PATTERN.test(filters.from)
    || typeof filters.to !== "string" || !TIME_PATTERN.test(filters.to)) {
    throw new Error("Invalid event filters.");
  }
  const user = await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase.from("user_event_preferences").upsert({
    user_id: user.id,
    search_query: filters.query,
    starts_after: filters.from,
    starts_before: filters.to,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

export async function pinEvent(event: UpcomingLimitlessEvent) {
  if (!isUpcomingLimitlessEvent(event) || !withinUpcomingWindow(event)
    || JSON.stringify(event).length > 4_000) {
    throw new Error("Invalid event.");
  }
  const user = await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase.from("user_event_pins").insert({
    user_id: user.id,
    event_id: event.id,
    event_snapshot: event as Json
  });
  if (error && error.code !== "23505") throw error;
}

export async function unpinEvent(eventId: string) {
  if (!/^[0-9a-f]{24}$/.test(eventId)) throw new Error("Invalid event ID.");
  const user = await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase.from("user_event_pins")
    .delete()
    .eq("user_id", user.id)
    .eq("event_id", eventId);
  if (error) throw error;
}
