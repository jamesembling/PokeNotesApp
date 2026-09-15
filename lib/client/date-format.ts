const DAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric"
});
const LONG_DAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

export function formatDayDate(date: string) {
  return DAY_DATE_FORMATTER.format(new Date(`${date}T00:00:00`));
}

export function formatLongDayDate(date: string) {
  return LONG_DAY_DATE_FORMATTER.format(new Date(`${date}T00:00:00`));
}
