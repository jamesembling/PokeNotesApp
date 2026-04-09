const AUTH_DEBUG_LOGGING_ENABLED =
  process.env.POKE_NOTES_DEBUG_AUTH === "1" ||
  (process.env.NODE_ENV === "development" && process.env.POKE_NOTES_DEBUG_AUTH === "verbose");

export function logAuthDebug(label: string, details?: Record<string, unknown>) {
  if (!AUTH_DEBUG_LOGGING_ENABLED) {
    return;
  }

  if (!details) {
    console.log(`[auth] ${label}`);
    return;
  }

  console.log(`[auth] ${label}`, details);
}
