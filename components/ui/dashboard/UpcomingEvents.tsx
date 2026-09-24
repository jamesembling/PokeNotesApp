"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, Search } from "lucide-react";
import { pinEvent, saveEventFilters, unpinEvent } from "@/app/(app)/dashboard/actions";
import { isUpcomingLimitlessEvent, withinUpcomingWindow, type EventFilters, type UpcomingLimitlessEvent } from "@/lib/tournaments/limitless-events";
import type { UserEventState } from "@/lib/db/upcoming-events";
import styles from "./upcoming-events.module.css";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const numberFormatter = new Intl.NumberFormat("en-GB");
const EVENT_REFRESH_MS = 5 * 60 * 1000;
const timeChoices = [
  { label: "Any time", hours: "All hours", from: "", to: "" },
  { label: "Morning", hours: "6 am–noon", from: "06:00", to: "11:59" },
  { label: "Afternoon", hours: "Noon–6 pm", from: "12:00", to: "17:59" },
  { label: "Evening", hours: "6 pm–midnight", from: "18:00", to: "23:59" },
  { label: "Overnight", hours: "Midnight–6 am", from: "00:00", to: "05:59" }
] as const;

function savedTimeLabel(filters: EventFilters) {
  if (filters.from && filters.to) return `${filters.from}–${filters.to}`;
  if (filters.from) return `After ${filters.from}`;
  return `Before ${filters.to}`;
}

function eventLocalMinutes(event: UpcomingLimitlessEvent) {
  const date = new Date(event.startsAt);
  return date.getHours() * 60 + date.getMinutes();
}

function timeMinutes(value: string) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function EventRow({
  event,
  pinned,
  disabled,
  onPin
}: {
  event: UpcomingLimitlessEvent;
  pinned: boolean;
  disabled: boolean;
  onPin: (event: UpcomingLimitlessEvent) => void;
}) {
  const start = new Date(event.startsAt);
  const registrationCount = typeof event.registeredPlayers === "number"
    ? `${numberFormatter.format(event.registeredPlayers)}${typeof event.registrationCapacity === "number" ? ` / ${numberFormatter.format(event.registrationCapacity)}` : ""} registered`
    : "Registration count unavailable";
  return (
    <li className={styles.eventRow}>
      <div className={styles.eventWhen}>
        <span>{dateFormatter.format(start)}</span>
        <strong>{timeFormatter.format(start)}</strong>
      </div>
      <div className={styles.eventInfo}>
        <a href={event.url} rel="noopener noreferrer" target="_blank">
          {event.name}<ArrowUpRight aria-hidden="true" size={14} />
        </a>
        <span>{registrationCount} · {event.organizer || "Limitless"}</span>
      </div>
      <button
        aria-label={pinned ? `Unpin ${event.name}` : `Pin ${event.name}`}
        aria-pressed={pinned}
        className={styles.pinButton}
        disabled={disabled}
        onClick={() => onPin(event)}
        title={pinned ? "Remove from maybe playing" : "Maybe playing"}
        type="button"
      >
        <Bookmark aria-hidden="true" fill={pinned ? "currentColor" : "none"} size={18} />
      </button>
    </li>
  );
}

export function UpcomingEvents({
  events,
  userId,
  unavailable = false,
  stale = false,
  persistenceAvailable,
  initialState
}: {
  events: UpcomingLimitlessEvent[];
  userId: string;
  unavailable?: boolean;
  stale?: boolean;
  persistenceAvailable: boolean;
  initialState: UserEventState;
}) {
  const [filters, setFilters] = useState<EventFilters>(initialState.filters);
  const [currentFeed, setCurrentFeed] = useState(events);
  const [feedStale, setFeedStale] = useState(stale);
  const [feedUnavailable, setFeedUnavailable] = useState(unavailable);
  const hasEvents = useRef(events.length > 0);
  const [pins, setPins] = useState<UpcomingLimitlessEvent[]>(initialState.pins);
  const [ready, setReady] = useState(persistenceAvailable);
  const [pendingPins, setPendingPins] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  const filterSaveQueue = useRef(Promise.resolve());
  const initialFilterRender = useRef(true);
  const [showAll, setShowAll] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"all" | "pinned">("all");
  const storageKey = `pokenotes:upcoming-events:${userId}`;

  useEffect(() => {
    let active = true;
    let loading = false;
    let lastChecked = 0;

    async function refreshEvents() {
      if (!active || loading || document.visibilityState !== "visible") return;
      loading = true;
      lastChecked = Date.now();
      try {
        const response = await fetch("/api/upcoming-events", { cache: "no-store" });
        if (!response.ok) throw new Error("Upcoming events request failed");
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("events" in result) ||
          !Array.isArray(result.events) || !result.events.every(isUpcomingLimitlessEvent) ||
          !("stale" in result) || typeof result.stale !== "boolean") {
          throw new Error("Upcoming events response was invalid");
        }
        if (!active) return;
        hasEvents.current = result.events.length > 0;
        setCurrentFeed(result.events);
        setFeedStale(result.stale);
        setFeedUnavailable(false);
      } catch {
        if (!active) return;
        setFeedStale(true);
        setFeedUnavailable(!hasEvents.current);
      } finally {
        loading = false;
      }
    }

    function refreshIfDue() {
      if (Date.now() - lastChecked >= EVENT_REFRESH_MS) void refreshEvents();
    }

    void refreshEvents();
    const timer = window.setInterval(refreshIfDue, EVENT_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfDue);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfDue);
    };
  }, []);

  useEffect(() => {
    if (persistenceAvailable) return;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
        filters?: Partial<EventFilters>;
        pins?: UpcomingLimitlessEvent[];
      } | null;
      if (stored?.filters) setFilters({
        query: stored.filters.query ?? "",
        from: stored.filters.from ?? "",
        to: stored.filters.to ?? ""
      });
      if (Array.isArray(stored?.pins)) setPins(stored.pins.filter(isUpcomingLimitlessEvent).filter((pin) => withinUpcomingWindow(pin)));
    } catch {
      // A malformed local preview preference should not block event discovery.
    }
    setReady(true);
  }, [persistenceAvailable, storageKey]);

  useEffect(() => {
    if (!ready || persistenceAvailable) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ filters, pins })); } catch {}
  }, [filters, pins, ready, persistenceAvailable, storageKey]);

  useEffect(() => {
    if (!persistenceAvailable) return;
    if (initialFilterRender.current) { initialFilterRender.current = false; return; }
    const timer = window.setTimeout(() => {
      filterSaveQueue.current = filterSaveQueue.current.catch(() => {}).then(() => saveEventFilters(filters));
      void filterSaveQueue.current.then(() => setSaveError(""), () => setSaveError("Could not save your event filters. Please try again."));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [filters, persistenceAvailable]);

  const currentEvents = useMemo(() => new Map(currentFeed.map((event) => [event.id, event])), [currentFeed]);
  const pinnedEvents = pins.map((pin) => currentEvents.get(pin.id) ?? pin)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const pinnedIds = new Set(pins.map((pin) => pin.id));
  const normalizedQuery = filters.query.trim().toLocaleLowerCase();
  const from = timeMinutes(filters.from);
  const to = timeMinutes(filters.to);
  const selectedTimeChoice = timeChoices.find((choice) => choice.from === filters.from && choice.to === filters.to);
  const filtered = currentFeed.filter((event) => {
    if (normalizedQuery && !`${event.name} ${event.organizer}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
    const minutes = eventLocalMinutes(event);
    if (from !== null && to !== null && from > to) return minutes >= from || minutes <= to;
    return (from === null || minutes >= from) && (to === null || minutes <= to);
  });
  const visible = showAll ? filtered : filtered.slice(0, 12);

  function updateFilter(key: keyof EventFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setShowAll(false);
  }

  async function togglePin(event: UpcomingLimitlessEvent) {
    if (pendingPins.includes(event.id)) return;
    const wasPinned = pins.some((pin) => pin.id === event.id);
    setPins((current) => wasPinned ? current.filter((pin) => pin.id !== event.id) : [...current, event]);
    if (!persistenceAvailable) return;
    setPendingPins((current) => [...current, event.id]);
    try {
      if (wasPinned) await unpinEvent(event.id);
      else await pinEvent(event);
      setSaveError("");
    } catch {
      setPins((current) => wasPinned ? [...current, event] : current.filter((pin) => pin.id !== event.id));
      setSaveError("Could not save your pinned event. Please try again.");
    } finally {
      setPendingPins((current) => current.filter((id) => id !== event.id));
    }
  }

  return (
    <section aria-labelledby="dashboard-events-title" className={styles.section}>
      <div className={styles.heading}>
        <div>
          <h2 id="dashboard-events-title">Upcoming events</h2>
        </div>
        <a href="https://play.limitlesstcg.com/tournaments/upcoming?game=PTCG&type=online&platform=PTCGL&format=STANDARD" rel="noopener noreferrer" target="_blank">View on Limitless <ArrowUpRight aria-hidden="true" size={15} /></a>
      </div>
      <div aria-label="Event lists" className={styles.mobileTabs}>
        <button aria-pressed={mobilePanel === "all"} onClick={() => setMobilePanel("all")} type="button">All events</button>
        <button aria-pressed={mobilePanel === "pinned"} onClick={() => setMobilePanel("pinned")} type="button">Pinned ({pinnedEvents.length})</button>
      </div>
      <div className={styles.columns}>
        <div className={`${styles.allPanel} ${mobilePanel === "pinned" ? styles.mobileHidden : ""}`}>
          <div className={styles.panelHeading}><h3>All events</h3><span>{filtered.length} found</span></div>
          <div className={styles.filters}>
            <label className={styles.search}>
              <span className="sr-only">Search event or organizer</span>
              <Search aria-hidden="true" size={16} />
              <input disabled={!ready} onChange={(event) => updateFilter("query", event.target.value)} placeholder="Search event or organizer" type="search" value={filters.query} />
            </label>
            <div className={styles.timeFilter}>
              <span className={styles.timeFilterLabel}>Start time <span>· your local time</span></span>
              <div aria-label="Filter by start time" className={styles.timeChoices} role="group">
                {timeChoices.map((choice) => (
                  <button
                    aria-pressed={selectedTimeChoice?.label === choice.label}
                    className={styles.timeChoice}
                    disabled={!ready}
                    key={choice.label}
                    onClick={() => {
                      setFilters((current) => ({ ...current, from: choice.from, to: choice.to }));
                      setShowAll(false);
                    }}
                    type="button"
                  >
                    <strong>{choice.label}</strong>
                    <span>{choice.hours}</span>
                  </button>
                ))}
                {!selectedTimeChoice ? (
                  <span className={styles.savedTimeChoice}>
                    <strong>Saved window</strong>
                    <span>{savedTimeLabel(filters)}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {feedStale ? <p className={styles.notice}>Showing the last available Limitless listing while the live page is unavailable.</p> : null}
          {!persistenceAvailable ? <p className={styles.notice}>Pins and filters are saved on this device until account sync is available.</p> : null}
          {saveError ? <p className={styles.error} role="alert">{saveError}</p> : null}
          {feedUnavailable ? <p className={styles.message}>Limitless events could not be loaded. Try refreshing the dashboard.</p> : null}
          {!feedUnavailable && filtered.length === 0 ? <p className={styles.message}>No events match. Choose another time of day or change your search.</p> : null}
          <ul className={styles.eventList}>{visible.map((event) => <EventRow disabled={!ready || pendingPins.includes(event.id)} event={event} key={event.id} onPin={togglePin} pinned={pinnedIds.has(event.id)} />)}</ul>
          {!showAll && filtered.length > visible.length ? (
            <button className={styles.moreButton} onClick={() => setShowAll(true)} type="button">Show all {filtered.length} events</button>
          ) : null}
        </div>
        <div className={`${styles.pinnedPanel} ${mobilePanel === "all" ? styles.mobileHidden : ""}`}>
          <div className={styles.panelHeading}><h3>Pinned</h3><span>{pinnedEvents.length}</span></div>
          {pinnedEvents.length === 0 ? <p className={styles.pinnedEmpty}>Events you’re considering will appear here. Use the bookmark beside any event to pin it.</p> : null}
          <ul className={styles.eventList}>{pinnedEvents.map((event) => <EventRow disabled={!ready || pendingPins.includes(event.id)} event={event} key={event.id} onPin={togglePin} pinned />)}</ul>
        </div>
      </div>
    </section>
  );
}
