import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isUpcomingLimitlessEvent,
  parseUpcomingLimitlessEvents,
  withinUpcomingWindow,
  type UpcomingLimitlessEvent
} from "@/lib/tournaments/limitless-events";
import type { UpcomingRefreshMode } from "@/lib/tournaments/limitless-sync-auth";
import type { Json } from "@/types/supabase";

const UPCOMING_URL =
  "https://play.limitlesstcg.com/tournaments/upcoming?game=PTCG&type=online&platform=PTCGL&format=STANDARD";
const FEED_KEY = "ptcg-standard-ptcgl";
const REFRESH_LEASE_MS = 60_000;

const MINIMUM_AGE_MS: Record<UpcomingRefreshMode, number> = {
  manual: 0,
  primary: 55 * 60_000,
  fallback: 75 * 60_000
};

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
    stale: Date.now() - Date.parse(data.refreshed_at) > 3 * 60 * 60 * 1000
  };
}

export async function refreshUpcomingLimitlessSnapshot(mode: UpcomingRefreshMode = "manual") {
  const supabase = createAdminClient();
  const now = Date.now();
  const claimToken = crypto.randomUUID();
  const { data: claim, error: claimError } = await supabase
    .from("limitless_event_feed")
    .update({
      refresh_claim_token: claimToken,
      refresh_lease_until: new Date(now + REFRESH_LEASE_MS).toISOString()
    })
    .eq("feed_key", FEED_KEY)
    .lt("refreshed_at", new Date(now - MINIMUM_AGE_MS[mode]).toISOString())
    .or(`refresh_lease_until.is.null,refresh_lease_until.lt.${new Date(now).toISOString()}`)
    .select("feed_key")
    .maybeSingle();
  if (claimError && ["42703", "PGRST204"].includes(claimError.code) &&
    /refresh_claim_token|refresh_lease_until/.test(claimError.message)) {
    // A production app deployment can precede the controlled database migration.
    const events = await fetchUpcomingEvents();
    const { error } = await supabase.from("limitless_event_feed").upsert({
      feed_key: FEED_KEY,
      events: events as Json,
      refreshed_at: new Date().toISOString()
    });
    if (error) throw error;
    return { skipped: false, eventCount: events.length, compatibilityMode: true };
  }
  if (claimError) throw claimError;
  if (!claim) return { skipped: true, eventCount: null };

  try {
    const events = await fetchUpcomingEvents();
    const { data: saved, error: saveError } = await supabase
      .from("limitless_event_feed")
      .update({
        events: events as Json,
        refreshed_at: new Date().toISOString(),
        refresh_claim_token: null,
        refresh_lease_until: null
      })
      .eq("feed_key", FEED_KEY)
      .eq("refresh_claim_token", claimToken)
      .select("refreshed_at")
      .maybeSingle();
    if (saveError) throw saveError;
    if (!saved) throw new Error("Limitless refresh lease was superseded");
    return { skipped: false, eventCount: events.length };
  } catch (error) {
    await supabase
      .from("limitless_event_feed")
      .update({ refresh_claim_token: null, refresh_lease_until: null })
      .eq("feed_key", FEED_KEY)
      .eq("refresh_claim_token", claimToken);
    throw error;
  }
}
