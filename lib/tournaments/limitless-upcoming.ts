import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isUpcomingLimitlessEvent,
  parseUpcomingLimitlessEvents,
  withinUpcomingWindow,
  type UpcomingLimitlessEvent
} from "@/lib/tournaments/limitless-events";
import type { Json } from "@/types/supabase";

const UPCOMING_URL =
  "https://play.limitlesstcg.com/tournaments/upcoming?game=PTCG&type=online&platform=PTCGL&format=STANDARD";
const FEED_KEY = "ptcg-standard-ptcgl";

async function fetchUpcomingEvents() {
  const response = await fetch(UPCOMING_URL, {
    cache: "no-store",
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Limitless upcoming page returned ${response.status}`);
  const html = await response.text();
  if (!html.includes("upcoming-tournaments")) {
    throw new Error("Limitless upcoming page layout changed");
  }
  const events = parseUpcomingLimitlessEvents(html);
  if (events.length === 0) throw new Error("Limitless upcoming page contained no matching events");
  return events;
}

export async function getUpcomingLimitlessEvents(): Promise<{
  events: UpcomingLimitlessEvent[];
  stale: boolean;
  refreshedAt: string;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("limitless_event_feed")
    .select("events, refreshed_at")
    .eq("feed_key", FEED_KEY)
    .maybeSingle();
  if (error) throw error;
  if (!Array.isArray(data?.events) || !data.refreshed_at || !Number.isFinite(Date.parse(data.refreshed_at))) {
    throw new Error("Limitless event snapshot is unavailable");
  }
  const events = data.events.filter(isUpcomingLimitlessEvent).filter((event) => withinUpcomingWindow(event));
  return {
    events,
    refreshedAt: data.refreshed_at,
    stale: Date.now() - Date.parse(data.refreshed_at) > 26 * 60 * 60 * 1000
  };
}

export async function refreshUpcomingLimitlessSnapshot() {
  const events = await fetchUpcomingEvents();
  const supabase = createAdminClient();
  const { error } = await supabase.from("limitless_event_feed").upsert({
    feed_key: FEED_KEY,
    events: events as unknown as Json,
    refreshed_at: new Date().toISOString()
  });
  if (error) throw error;
  return { eventCount: events.length };
}
