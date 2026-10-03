import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinition, CardDefinitionEvidence } from "@/lib/card-definition-catalog/types";
import type { ReplayEffectKind } from "./types";

export type ReplayEffectOperation = "put_counters" | "move_counters" | "return_energy";
export type ReplayEffectTarget = {
  /** Relative to the controller of the effect, never the log detail's possessive. */
  owner: "effect_actor" | "opponent" | "either" | "trigger";
  zone: "board" | "active" | "bench";
  subject?: "source" | "trigger" | "healed";
};
type CounterQuantity = { kind: "exact" | "at_most" | "all" | "any"; value?: number; perTarget?: true };
type BenchTrigger = { kind: "bench"; basic: true; excludedType?: string; duringOwnerTurn: true };
export type ReplayEffectConstraint =
  | { status: "known"; operation: "put_counters"; target: ReplayEffectTarget; quantity: CounterQuantity; trigger?: BenchTrigger }
  | { status: "known"; operation: "move_counters"; from: ReplayEffectTarget; to: ReplayEffectTarget; quantity: CounterQuantity; distinctTargets: boolean }
  | { status: "known"; operation: "return_energy"; target: ReplayEffectTarget; origin: "board"; destination: "hand"; all: true; requiresRecordedHeal: boolean }
  | { status: "neutral" | "unmodelled" | "unavailable"; operation: ReplayEffectOperation };

const cleanText = (text: string) => text.normalize("NFC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const unknown = (operation: ReplayEffectOperation): ReplayEffectConstraint => ({ status: "unmodelled", operation });

function target(text: string, antecedent?: ReplayEffectTarget["owner"]): ReplayEffectTarget | null {
  const value = normalizeText(text).replace(/^(?:1|one|each|any|any 1|another) (?:of )?/, "");
  if (value === "this pokemon") return { owner: "effect_actor", zone: "board", subject: "source" };
  if (value === "the defending pokemon" || value === "defending pokemon") return { owner: "opponent", zone: "active" };
  if (value === "pokemon both yours and your opponent's") return { owner: "either", zone: "board" };
  const match = /^(your opponent's|your|their) (?:(other|benched|active) )?pokemon$/.exec(value);
  if (!match) return null;
  const owner = match[1] === "your opponent's" ? "opponent" : match[1] === "your" ? "effect_actor" : antecedent;
  return owner ? { owner, zone: match[2] === "benched" ? "bench" : match[2] === "active" ? "active" : "board" } : null;
}

function quantity(text: string): CounterQuantity | null {
  const match = /^(?:(up to) )?(a|an?|all|\d+)$/.exec(text.toLowerCase());
  if (!match) return null;
  if (match[2] === "all") return { kind: "all" };
  const value = /^a/.test(match[2]) ? 1 : Number(match[2]);
  return Number.isSafeInteger(value) && value > 0 && value <= 60 ? { kind: match[1] ? "at_most" : "exact", value } : null;
}

/** Activation conditions do not change an explicit target domain once the log
 * records execution. Alternate target branches and unsupported selectors do. */
function fromText(raw: string, operation: ReplayEffectOperation): ReplayEffectConstraint {
  const text = cleanText(raw);
  if (operation === "put_counters") {
    const clauses = [...text.matchAll(/\b(?:put|place) (up to \d+|\d+|a|all) damage counters? on (.+?)(?=\.|$)/gi)];
    if (!clauses.length) return /damage counters?/i.test(text) ? unknown(operation) : { status: "neutral", operation };
    if (clauses.length !== 1 || /\bif (?:heads|tails)\b|\botherwise\b|\bfor each\b/i.test(text)) return unknown(operation);
    const clause = clauses[0];
    const suffix = clause[2].replace(/ in any way you like$/i, "");
    const amount = quantity(clause[1]);
    if (!amount) return unknown(operation);
    if (/^each /i.test(suffix)) amount.perTarget = true;
    const selected = target(suffix);
    if (selected) return { status: "known", operation, target: selected, quantity: amount };
    if (/^that Pok[eé]mon$/i.test(suffix)) {
      const trigger = /^Whenever any player puts a Basic(?: non-\{([A-Z])\})? Pok[eé]mon onto their Bench during their turn, (?:put|place) \d+ damage counters? on that Pok[eé]mon\.$/i.exec(text);
      const types: Record<string, string> = { D: "Darkness", F: "Fighting", G: "Grass", L: "Lightning", M: "Metal", P: "Psychic", R: "Fire", W: "Water", Y: "Fairy", N: "Dragon", C: "Colorless" };
      if (trigger && (!trigger[1] || types[trigger[1].toUpperCase()])) return {
        status: "known", operation, target: { owner: "trigger", zone: "bench", subject: "trigger" }, quantity: amount,
        trigger: { kind: "bench", basic: true, duringOwnerTurn: true, ...(trigger[1] ? { excludedType: types[trigger[1].toUpperCase()] } : {}) },
      };
    }
    return unknown(operation);
  }
  if (operation === "move_counters") {
    const clauses = [...text.matchAll(/\bmove (up to \d+|\d+|a|all|any number of) damage counters? from (.+?) to (.+?)(?=\.|$)/gi)];
    if (!clauses.length) return /damage counters?/i.test(text) ? unknown(operation) : { status: "neutral", operation };
    if (clauses.length !== 1 || /\bif (?:heads|tails)\b|\botherwise\b/i.test(text)) return unknown(operation);
    const clause = clauses[0];
    const from = target(clause[2]);
    const to = target(clause[3].replace(/ in any way you like$/i, ""), from?.owner);
    const amount: CounterQuantity | null = clause[1] === "any number of" ? { kind: "any" } : quantity(clause[1]);
    if (!from || !to || !amount) return unknown(operation);
    return { status: "known", operation, from, to, quantity: amount, distinctTargets: /\b(?:other|another)\b/i.test(clause[3]) };
  }
  const clauses = [...text.matchAll(/\b(?:put|return) all Energy(?: cards)? attached to (.+?) (?:in|into|to) your hand(?=\.|$)/gi)];
  if (!clauses.length) return /\bEnergy\b[\s\S]*\b(?:hand|deck|discard)\b/i.test(text) ? unknown(operation) : { status: "neutral", operation };
  if (clauses.length !== 1) return unknown(operation);
  const subject = clauses[0][1];
  if (/^that Pok[eé]mon$/i.test(subject) && /^Heal all damage from 1 of your Mega Evolution Pok[eé]mon ex\. If you healed any damage in this way, /i.test(text))
    return { status: "known", operation, target: { owner: "effect_actor", zone: "board", subject: "healed" }, origin: "board", destination: "hand", all: true, requiresRecordedHeal: true };
  const selected = target(subject);
  return selected && selected.owner === "effect_actor" ? { status: "known", operation, target: selected, origin: "board", destination: "hand", all: true, requiresRecordedHeal: false } : unknown(operation);
}

function effectText(card: CardDefinition, effectName: string | undefined, kind: ReplayEffectKind): string | null {
  if (kind === "attack" || kind === "ability") {
    if (!effectName) return null;
    const matches = (kind === "attack" ? card.attacks : card.abilities).filter((effect) => normalizeText(effect.name) === normalizeText(effectName));
    return matches.length === 1 ? matches[0].text : null;
  }
  return card.rules === null ? null : card.rules.join(" ");
}

/** Complete candidate agreement is required for every executable constraint. */
export function resolveReplayEffectConstraint(
  evidence: CardDefinitionEvidence | undefined,
  effectName: string | undefined,
  kind: ReplayEffectKind,
  operation: ReplayEffectOperation,
): ReplayEffectConstraint {
  if (!evidence || evidence.coverage !== "complete" || !evidence.candidates.length) return { status: "unavailable", operation };
  const plans = evidence.candidates.map((card) => {
    const text = effectText(card, effectName, kind);
    return text === null ? { status: "unavailable" as const, operation } : fromText(text, operation);
  });
  if (plans.some((plan) => plan.status === "unavailable")) return { status: "unavailable", operation };
  return plans.every((plan) => JSON.stringify(plan) === JSON.stringify(plans[0])) ? plans[0] : unknown(operation);
}

/** Check the catalogue-known portion of a bound trigger; the compiler must also
 * prove its Bench transition, actor/turn, and physical identity from the log. */
export function replayBenchTriggerMatches(constraint: ReplayEffectConstraint, evidence: CardDefinitionEvidence | undefined): boolean | null {
  if (constraint.status !== "known" || constraint.operation !== "put_counters" || !constraint.trigger) return null;
  if (!evidence || evidence.coverage !== "complete" || !evidence.candidates.length) return null;
  const excluded = constraint.trigger.excludedType;
  const matches = evidence.candidates.map((card) => {
    if (card.stage === null || excluded && card.types === null) return null;
    return normalizeText(card.stage!) === "basic" && (!excluded || !card.types!.some((type) => normalizeText(type) === normalizeText(excluded)));
  });
  return matches.every((match) => match !== null && match === matches[0]) ? matches[0] : null;
}
