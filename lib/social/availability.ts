/** Only the additive social RPC missing during deployment is a compatibility state. */
export function isSocialSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const details = error as { code?: unknown; message?: unknown };
  return details.code === "PGRST202" && typeof details.message === "string" && /\b(?:public\.)?get_player_profile\b/.test(details.message);
}
