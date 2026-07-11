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
