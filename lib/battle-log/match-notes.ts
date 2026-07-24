export function normalizeMatchNotes(value: unknown): string | null {
  const notes = String(value ?? "").trim();
  return notes || null;
}
