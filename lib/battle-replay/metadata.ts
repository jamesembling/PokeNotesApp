import { extractUsedEffectCandidate } from "@/lib/battle-log/effect-catalog";
import { normalizeText } from "@/lib/log-import/normalization";
import type { ReplayProgram } from "./types";

/** Collect public card names from reconstructed evidence, never player names or raw logs. */
export function collectReplayDefinitionNames(program: ReplayProgram, lines: readonly string[], playerNames: readonly string[] = []): string[] {
  const names = new Set<string>();
  const players = new Set(playerNames.map(normalizeText));
  const add = (name: unknown) => {
    if (typeof name === "string" && name.trim().length >= 2 && name.length <= 120
      && !/^(?:it|them|a card|cards?|an? Energy|[a-z]+ Energy:\s*\d+.*)$/i.test(name.trim())) names.add(name.trim());
  };
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string") add(record.name);
    add(record.tool);
    if (Array.isArray(record.energy)) for (const energy of record.energy) add(energy);
    for (const child of Object.values(record)) visit(child);
  };
  visit(program.frames);
  visit(program.events.map((event) => event.transaction));
  for (const line of lines) {
    const used = extractUsedEffectCandidate(line)?.cardName;
    if (used && !players.has(normalizeText(used))) add(used);
    add(line.match(/\bplayed\s+(.+?)(?=\s+(?:to|into)\s+(?:the\s+)?(?:Active Spot|Bench|Stadium spot)\b|\s*(?:->|→)\s*|\.$|$)/i)?.[1]);
    add(line.match(/^.+?\sattached\s+(.+?)(?=\s+to\b)/i)?.[1]);
  }
  return [...names].sort();
}
