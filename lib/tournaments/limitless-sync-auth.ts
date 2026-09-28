export type UpcomingRefreshMode = "manual" | "primary" | "fallback";

export function parseLimitlessRefreshMode(url: string): UpcomingRefreshMode | null {
  const mode = new URL(url).searchParams.get("mode");
  if (mode === null) return "manual";
  if (mode === "primary" || mode === "fallback") return mode;
  return null;
}

export function isAuthorizedLimitlessSync(
  authorization: string | null,
  cronSecret: string | undefined,
  scheduledSyncSecret: string | undefined
) {
  return Boolean(authorization && [cronSecret, scheduledSyncSecret]
    .some((secret) => secret && authorization === `Bearer ${secret}`));
}
