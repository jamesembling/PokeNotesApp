import { createHash } from "node:crypto";
import { cardDefinitionSourceUrl } from "./rule-evidence.mjs";
import { isSupportedBasicEnergy, validCardDefinitionDay } from "./legality.mjs";

const mark = (value) => typeof value === "string" && /^[a-z]$/i.test(value.trim()) ? value.trim().toUpperCase() : undefined;
const instant = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && validCardDefinitionDay(value) !== undefined && Number.isFinite(Date.parse(value));
const collector = (value) => typeof value === "string" && value.trim() ? value.trim() : Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined;
function identity(card, set) {
  const localId = collector(card?.localId);
  if (!card || typeof card.id !== "string" || typeof card.name !== "string" || !card.name.trim() || !localId
    || typeof set?.id !== "string" || card.set?.id !== set.id || card.id !== `${set.id}-${localId}`
    || !["Pokemon", "Trainer", "Energy"].includes(card.category)) throw new Error("Invalid exact TCGdex regulation printing identity.");
  if (card.regulationMark != null && typeof card.regulationMark !== "string") throw new Error("Malformed TCGdex regulation mark.");
  return localId;
}
/** Request scope only: release age never establishes a regulation mark. */
export function needsTcgdexRegulationMarkCompletion(card, set) {
  identity(card, set);
  if (mark(card.regulationMark)) return false;
  const day = validCardDefinitionDay(set.releaseDate);
  // First Sword & Shield expansion date in the pinned primary manifest.
  if (!day || day < "2020-02-07") return false;
  return !isSupportedBasicEnergy({ ...card, abilities: card.abilities ?? [], attacks: card.attacks ?? [],
    rules: typeof card.effect === "string" && card.effect.length ? [card.effect] : card.rules ?? null });
}
function agrees(left, right, path) {
  if (left == null || right == null) return true; // unknown is not absence
  if (path.endsWith(".damage") && ["string", "number"].includes(typeof left) && ["string", "number"].includes(typeof right)) return String(left) === String(right);
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => agrees(value, right[index], `${path}.${index}`));
  if (typeof left === "object" || typeof right === "object") return typeof left === "object" && typeof right === "object"
    && Object.keys(left).filter((key) => Object.hasOwn(right, key)).every((key) => agrees(left[key], right[key], `${path}.${key}`));
  return left === right;
}
const operativeFields = ["hp", "trainerType", "stage", "types", "evolveFrom", "energyType", "effect", "rules", "abilities", "attacks", "suffix", "ancientTrait", "additionalPassiveTraits", "weaknesses", "resistances", "retreat"];
/** Exact same-provider supplement, only for a missing/invalid mark. Never replace
 * supplied operative facts or turn missing REST metadata into printed absence. */
export function applyTcgdexRegulationMarkCompletion(primary, secondary, set, fetchedAt, normalize) {
  if (!needsTcgdexRegulationMarkCompletion(primary, set)) return primary;
  const localId = identity(secondary, set);
  if (secondary.id !== primary.id || secondary.name !== primary.name || secondary.category !== primary.category
    || localId !== collector(primary.localId)) throw new Error(`Conflicting TCGdex REST printing identity: ${primary.id}`);
  if (typeof normalize !== "function") throw new Error("TCGdex mark completion requires the source normalizer.");
  const prepare = (card) => normalize({ ...card, abilities: card.abilities ?? undefined, attacks: card.attacks ?? undefined }, set, fetchedAt);
  const left = prepare(primary), right = prepare(secondary);
  const fieldName = { evolveFrom: "evolvesFrom", effect: "rules", ancientTrait: "additionalPassiveTraits" };
  for (const field of operativeFields) {
    if (primary[field] == null || secondary[field] == null) continue;
    const normalizedField = fieldName[field] ?? field;
    if (!agrees(left[normalizedField] ?? primary[field], right[normalizedField] ?? secondary[field], field)) throw new Error(`Conflicting TCGdex REST ${field}: ${primary.id}`);
  }
  // Equivalent source aliases still describe the same normalized field.
  for (const field of ["rules", "additionalPassiveTraits"]) if (!agrees(left[field], right[field], field)) throw new Error(`Conflicting TCGdex REST ${field}: ${primary.id}`);
  if (secondary.set.releaseDate != null && secondary.set.releaseDate !== set.releaseDate) throw new Error(`Conflicting TCGdex REST set release date: ${primary.id}`);
  const supplied = mark(secondary.regulationMark);
  if (supplied && !/^[A-J]$/.test(supplied)) throw new Error(`Unsupported TCGdex REST regulation mark: ${primary.id}`);
  if (!supplied) {
    if (secondary.regulationMark != null && secondary.regulationMark.trim() && secondary.regulationMark !== "None") throw new Error(`Malformed TCGdex REST regulation mark: ${primary.id}`);
    return primary;
  }
  if (!instant(fetchedAt)) throw new Error("Invalid TCGdex regulation completion capture.");
  return { ...primary, regulationMark: secondary.regulationMark, regulationMarkProvenance: {
    provider: "tcgdex-rest", sourceCardId: primary.id, sourceUrl: cardDefinitionSourceUrl(primary.id),
    payloadSha256: createHash("sha256").update(JSON.stringify(secondary)).digest("hex"), fetchedAt,
    sourceUpdatedAt: typeof secondary.updated === "string" && secondary.updated.trim() ? secondary.updated : null,
    originalRegulationMark: primary.regulationMark ?? null, suppliedRegulationMark: secondary.regulationMark,
  } };
}
/** Field receipt, not a reviewed printed-absence or whole-card certificate. */
export function isTcgdexRegulationMarkProvenance(card) {
  const p = card?.regulationMarkProvenance;
  if (p === undefined) return true;
  return Boolean(p && p.provider === "tcgdex-rest" && card.source === "tcgdex" && card.sourceCardId === `${card.setId}-${card.localId}`
    && p.sourceCardId === card.sourceCardId && p.sourceUrl === cardDefinitionSourceUrl(card.sourceCardId) && card.sourceUrl === p.sourceUrl
    && /^[A-J]$/.test(card.regulationMark ?? "") && mark(p.suppliedRegulationMark) === card.regulationMark
    && (card.rawRegulationMark ?? card.regulationMark) === p.suppliedRegulationMark?.trim() && typeof p.payloadSha256 === "string" && /^[a-f0-9]{64}$/.test(p.payloadSha256)
    && instant(p.fetchedAt) && (p.sourceUpdatedAt === null || typeof p.sourceUpdatedAt === "string" && p.sourceUpdatedAt.trim())
    && (p.originalRegulationMark === null || typeof p.originalRegulationMark === "string" && !mark(p.originalRegulationMark)));
}
