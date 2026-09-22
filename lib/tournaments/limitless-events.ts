const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type UpcomingLimitlessEvent = {
  id: string;
  name: string;
  organizer: string;
  startsAt: string;
  platform: string;
  format: string;
  registeredPlayers: number | null;
  registrationCapacity: number | null;
  url: string;
};

export type EventFilters = {
  query: string;
  from: string;
  to: string;
};

export const defaultEventFilters: EventFilters = { query: "", from: "", to: "" };

export function isUpcomingLimitlessEvent(value: unknown): value is UpcomingLimitlessEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<UpcomingLimitlessEvent>;
  return typeof event.id === "string" && /^[0-9a-f]{24}$/.test(event.id)
    && typeof event.name === "string" && event.name.length > 0
    && typeof event.organizer === "string"
    && typeof event.startsAt === "string" && Number.isFinite(Date.parse(event.startsAt))
    && event.platform === "PTCGL" && event.format === "Standard"
    && (event.registeredPlayers === null || (typeof event.registeredPlayers === "number" && Number.isSafeInteger(event.registeredPlayers) && event.registeredPlayers >= 0))
    && (event.registrationCapacity === null || (typeof event.registrationCapacity === "number" && Number.isSafeInteger(event.registrationCapacity) && event.registrationCapacity >= 0))
    && event.url === `https://play.limitlesstcg.com/tournament/${event.id}/details`;
}

export function withinUpcomingWindow(event: UpcomingLimitlessEvent, now = Date.now()) {
  const start = Date.parse(event.startsAt);
  return start >= now && start < now + THIRTY_DAYS_MS;
}

function decodeHtml(value: string) {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    const named: Record<string, string> = {
      amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " "
    };
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
    const number = entity[1]?.toLowerCase() === "x"
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(number) && number > 0 && number <= 0x10ffff
      ? String.fromCodePoint(number)
      : match;
  });
}

function attribute(row: string, name: string) {
  const match = row.match(new RegExp(`\\bdata-${name}="([^"]*)"`));
  return match ? decodeHtml(match[1]).trim() : "";
}

export function parseUpcomingLimitlessEvents(html: string, now = Date.now()): UpcomingLimitlessEvent[] {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const events = new Map<string, UpcomingLimitlessEvent>();

  for (const row of rows) {
    const id = row.match(/\/tournament\/([a-z0-9]+)\/details/)?.[1];
    const startsAt = attribute(row, "date");
    const name = attribute(row, "name");
    const platform = attribute(row, "platform");
    const start = Date.parse(startsAt);
    if (!id || !name || platform !== "PTCGL" || !Number.isFinite(start) || start < now || start >= now + THIRTY_DAYS_MS) {
      continue;
    }

    const formatCell = row.match(/<td class="format">([\s\S]*?)<\/td>/)?.[1] ?? "";
    const format = decodeHtml(formatCell.match(/data-tooltip="([^"]*)"/)?.[1] ?? "");
    if (format !== "Standard") continue;
    const playerCount = attribute(row, "players");
    const registeredPlayers = /^\d+$/.test(playerCount) ? Number(playerCount) : null;
    const registrationCell = row.match(/<td class="registrations">([\s\S]*?)<\/td>/)?.[1] ?? "";
    const countAndCapacity = registrationCell.replace(/<[^>]*>/g, " ").match(/([\d,]+)\s*\/\s*([\d,]+)/);
    const registrationCapacity = countAndCapacity && registeredPlayers === Number(countAndCapacity[1].replace(/,/g, ""))
      ? Number(countAndCapacity[2].replace(/,/g, ""))
      : null;
    events.set(id, {
      id,
      name,
      organizer: attribute(row, "organizer"),
      startsAt,
      platform,
      format,
      registeredPlayers,
      registrationCapacity,
      url: `https://play.limitlesstcg.com/tournament/${id}/details`
    });
  }

  return [...events.values()].sort((left, right) =>
    Date.parse(left.startsAt) - Date.parse(right.startsAt)
  );
}
