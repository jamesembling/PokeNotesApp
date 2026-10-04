import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinitionEvidence } from "@/lib/card-definition-catalog/types";
import type { ReplayCard } from "./types";

/** Execution text constrains copy eligibility independently of the Ability's
 * effect. Unsupported activation clauses must not become unconditional uses. */
export type ReplayAbilityActivation =
  | { kind: "unconditional"; once: boolean }
  | { kind: "basic_energy"; once: true; symbol: string }
  | { kind: "active_has_ability"; once: true; ability: string }
  | { kind: "from_hand_evolution"; once: boolean }
  | { kind: "unmodelled"; once: boolean };

export function resolveReplayAbilityActivation(texts: readonly string[] | null | undefined): ReplayAbilityActivation {
  if (!texts?.length) return { kind: "unmodelled", once: false };
  const plans = texts.map((raw): ReplayAbilityActivation => {
    const text = raw.replace(/\s+/g, " ").trim();
    const prefix = /^Once during your turn[, (]/i.test(text);
    const global = /(?:can['’]?t|cannot|may not) (?:use|apply) more than 1|only (?:use|apply) (?:this|1|one).+?Ability|(?:use|apply) only (?:1|one)\b/i.test(text);
    const once = prefix && !global;
    if (global) return { kind: "unmodelled", once: false };
    if (/^(?:Once during your turn, )?[Ww]hen you play this Pok[eé]mon from your hand to evolve 1 of your Pok[eé]mon(?: during your turn)?, /i.test(text)) return { kind: "from_hand_evolution", once };
    const energy = /^Once during your turn, if this Pok[eé]mon has any \{([DFGLMPRWYNC])\} Energy attached, /i.exec(text);
    if (energy) return { kind: "basic_energy", once: true, symbol: energy[1].toUpperCase() };
    const body = text.replace(/^Once during your turn, /i, "");
    const active = /^if your Active Pok[eé]mon has the ([^,.]+) Ability, (.+)$/i.exec(body);
    if (once && active && !/\b(?:if|when|whenever|while|unless|only)\b/i.test(active[2])) return { kind: "active_has_ability", once: true, ability: active[1] };
    if (/\b(?:only if|only when|unless)\b/i.test(body) || /^(?:if|when|whenever|while|as long as)\b/i.test(body) || prefix && body === text) return { kind: "unmodelled", once };
    return { kind: "unconditional", once };
  });
  return plans.every((plan) => JSON.stringify(plan) === JSON.stringify(plans[0])) ? plans[0] : { kind: "unmodelled", once: plans.every((plan) => plan.once) };
}

/** Complete printed Hand-to-board clauses that explicitly count as evolution.
 * Historical wording may differ while origin/activation semantics agree. */
export function isReplayHandEvolutionText(raw: string): boolean {
  const text = raw.replace(/\s+/g, " ").trim();
  const start = "Choose 1 of your Basic Pok[eé]mon in play\\. If you have a ";
  const hand = "(?:Stage 2 card in your hand that evolves from that Pok[eé]mon|Stage 1 or Stage 2 card that evolves from that Pok[eé]mon in your hand), ";
  const evolution = "put that card (?:on the Basic Pok[eé]mon\\. \\(This counts as evolving that Pok[eé]mon\\.\\)|onto the Basic Pok[eé]mon to evolve it(?:, skipping the Stage 1)?\\.)";
  const timing = "(?: You can['’]t use this card during your first turn or on a Basic Pok[eé]mon that was put into play this turn\\.)?";
  const extra = "(?: If you choose a Stage 2 Pok[eé]mon in your hand, put that Pok[eé]mon on the Basic Pok[eé]mon instead of on a Stage 1 Pok[eé]mon\\.)?";
  return new RegExp(`^${start}${hand}${evolution}${timing}${extra}$`, "i").test(text);
}

/** Cohort cardinality does not model individual physical-copy effects. */
export function isReplayCopyIndependentOnceAbilityText(text: string): boolean {
  const activation = resolveReplayAbilityActivation([text]);
  return (activation.kind === "unconditional" || activation.kind === "active_has_ability") && activation.once
    && !/\bthis Pok[eé]mon\b/i.test(text.replace(/^Once during your turn, /i, ""));
}

/** A valid recorded execution can establish this shared predicate at the
 * event without narrowing the Active's immutable native-printing query. */
export function supportsReplayActiveAbilityPredicate(input: {
  active: ReplayCard | null; activeUncertain: boolean | undefined; sourceName: string; ability: string;
  activeEvidence: CardDefinitionEvidence | undefined; sourceEvidence: CardDefinitionEvidence | undefined;
}): boolean {
  const { active, activeUncertain, sourceName, ability, activeEvidence, sourceEvidence } = input;
  if (!active || !active.physicalCardId || activeUncertain || active.instanceUncertain || normalizeText(active.name) === normalizeText(sourceName)) return false;
  return activeEvidence?.coverage === "complete" && activeEvidence.candidates.length > 0
    && activeEvidence.candidates.every((candidate) => candidate.abilities.every((effect) => effect.text !== null))
    && activeEvidence.candidates.some((candidate) => candidate.abilities.some((effect) => normalizeText(effect.name) === normalizeText(ability) && effect.text !== null))
    && sourceEvidence?.coverage === "complete" && sourceEvidence.candidates.length > 0
    && sourceEvidence.candidates.every((candidate) => candidate.abilities.every((effect) => effect.text !== null) && !candidate.abilities.some((effect) => normalizeText(effect.name) === normalizeText(ability)));
}

/** Remove only a complete, explicitly named per-turn limit sentence. Other
 * clauses, including suppression or conditional limits, stay available. */
export function stripReplayNamedAbilityLimits(raw: string): string {
  return raw.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const limit = /^You can['’]t use more than 1 ([\p{L}\p{N}][\p{L}\p{N} '\u2019-]*) Ability (?:each turn|during your turn)\.$/iu.exec(sentence.trim());
    return !limit || /\b(?:if|when|whenever|unless|while|except|and|or|until|provided)\b/i.test(limit[1]);
  }).join(" ");
}

/** A complete permission that grants attacks only to its own native top.
 * Callers must separately establish that this is another existing Pokémon. */
export function isReplaySelfAttackPermission(raw: string, sourceName: string): boolean {
  const name = sourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = raw.replace(/\s+/g, " ").trim();
  return new RegExp(`^(?:This Pok[eé]mon|${name}) can use (?:any attack from your Benched Pok[eé]mon|the attacks of any of your Benched Pok[eé]mon|the attacks of all Pok[eé]mon in play as its own)\\. ?(?:\\(You still need the necessary Energy to use each attack\\.\\))?$`, "i").test(text);
}

/** Passive permissions can override a native once-per-copy limit. This is
 * an absence guard, not an interpreter for repeat/reset/suppression effects. */
export function isReplayAbilityLimitContextNeutral(raw: string, localSource: boolean, effectName: string): boolean {
  const text = raw.replace(/\s+/g, " ").trim().replace(/^Once during your turn, /i, "")
    .replace(/You can['’]t use more than 1 (.+?) Ability (?:each turn|during your turn)\./gi, (clause, limited: string) => limited.toLowerCase() === effectName.toLowerCase() ? clause : "")
    .replace(/You can['’]t use more than 1 Ability that has ["“](.+?)["”] in its name each turn\./gi, (clause, limited: string) => effectName.toLowerCase().includes(limited.toLowerCase()) ? clause : "");
  if (!/\babilit(?:y|ies)\b/i.test(text)) return true;
  if (/(?:your|each|all|this) Pok[eé]mon[\s\S]{0,60}(?:can|may) use (?:the |any )?Abilit|(?:has|have|gains?|gain) (?:the )?(?:following|an?|additional) Abilit|Abilit[\s\S]{0,60}(?:as (?:its|their) own|of (?:your|other|another|any))|(?:can|may) use (?:the )?Abilit(?:y|ies) of/i.test(text)) return false;
  const limit = /\b(?:again|twice|additional|already used|more than once|as often|multiple times|reset|ignore|remove|lost|lose|has no|have no|no effect|stop working|cannot use|can['’]t use|may not use|use more than|use only|only use)\b/i;
  if (!limit.test(text)) return true;
  // A clearly local restriction or repeat permission on another Pokémon
  // cannot change this cohort's limit. Global/other-copy clauses still refuse.
  if (!localSource && /\bthis Ability\b/i.test(text) && !/\b(?:other|another|your Pok[eé]mon|each Pok[eé]mon|all Pok[eé]mon|their Abilities|any Abilities)\b/i.test(text)) return true;
  return false;
}
