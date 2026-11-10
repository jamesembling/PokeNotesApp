export const APP_TIME_ZONE = "Europe/London";

const APP_CALENDAR_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: APP_TIME_ZONE,
  year: "numeric"
});

export function formatAppCalendarDate(value: string | Date) {
  return APP_CALENDAR_DATE_FORMATTER.format(
    typeof value === "string" ? new Date(value) : value
  );
}

/**
 * Formats a date and a time and joins them itself. Engines join a combined
 * en-GB date-time differently (Node "10 Nov 2026, 00:03", Safari
 * "10 Nov 2026 at 00:03"), so a single formatter breaks hydration.
 */
export function createStableDateTimeFormatter(
  dateOptions: Intl.DateTimeFormatOptions,
  timeOptions: Intl.DateTimeFormatOptions
) {
  const dateFormatter = new Intl.DateTimeFormat("en-GB", dateOptions);
  const timeFormatter = new Intl.DateTimeFormat("en-GB", timeOptions);
  return {
    format: (value: Date) => `${dateFormatter.format(value)}, ${timeFormatter.format(value)}`
  };
}
