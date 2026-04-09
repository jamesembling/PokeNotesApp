const DAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

export function formatDayDate(date: string) {
  return DAY_DATE_FORMATTER.format(new Date(`${date}T00:00:00`));
}
