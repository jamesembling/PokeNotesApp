export function getTournamentRoundCreationIdentity(formData: FormData, fallbackId = crypto.randomUUID()) {
  const creationKey = String(formData.get("creationKey") || "").trim() || fallbackId;

  return {
    creationKey,
    roundId: creationKey
  };
}
