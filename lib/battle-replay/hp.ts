import { resolveCardDefinition, selectCardDefinitionPrinting } from "@/lib/card-definition-catalog/resolve";
import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinition, CardDefinitionEvidence, CardDefinitionEvidenceByName } from "@/lib/card-definition-catalog/types";
import type { ReplayCard, ReplayCardResolution, ReplayEffectKind, ReplayState, ReplayZoneCard } from "./types";
import { resolveReplayEffectConstraint, type ReplayEffectOperation } from "./effect-targets";
import type { ReplayLinkedCardDefinitions } from "./linked-deck-list";

const hasHp = (text: string) => /\bHP\b/i.test(text);

type ModifierScope = "attachment" | "stadium";

function appliesTo(selector: string, card: CardDefinition): boolean | null {
  const selected = normalizeText(selector);
  if (selected === "pokemon") return true;
  const stage = /^(basic|stage [12]) pokemon$/.exec(selected);
  if (stage) return card.stage === null ? null : normalizeText(card.stage).replaceAll(" ", "") === stage[1].replaceAll(" ", "");
  const typed = /^(grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy|dragon|colorless) pokemon$/.exec(selected);
  if (typed) return card.types === null ? null : card.types.some((type) => normalizeText(type) === typed[1]);
  const named = /^pokemon named (.+)$/.exec(selected);
  if (named) return normalizeText(card.name) === named[1];
  return null;
}

/** Rules are executable only when both the scope and the complete HP predicate
 * are understood. Agree across every still-compatible printing and target. */
function rulesHpModifier(
  source: CardDefinition[] | null,
  targets: CardDefinition[] | null,
  scope: ModifierScope,
): number | null {
  if (!source) return null;
  const values = source.flatMap((definition) => {
    if (definition.rules === null) return [null];
    const sentences = definition.rules.join(" ").split(/\.\s+|\.$/).filter(hasHp);
    if (!sentences.length) return [0];
    return (targets?.length ? targets : [null]).map((target) => {
      let total = 0;
      for (const sentence of sentences) {
        const match = scope === "attachment"
          ? /^The (.+?) this card is attached to gets ([+−-]\d+) HP$/i.exec(sentence.trim())
          : /^Each (.+?) in play(?: \(both yours and your opponent['’]s\))? gets ([+−-]\d+) HP$/i.exec(sentence.trim());
        if (!match) return null;
        const applies = target ? appliesTo(match[1], target) : normalizeText(match[1]) === "pokemon" ? true : null;
        if (applies === null) return null;
        if (applies) total += Number(match[2].replace("−", "-"));
      }
      return total;
    });
  });
  return values.every((value) => value !== null && value === values[0]) ? values[0] : null;
}

type HpEffect = { add: number; set?: number };
type AbilityPlan =
  | { kind: "none" }
  | { kind: "set-named"; name: string; value: number }
  | { kind: "unknown"; scope: "self" | "own" | "both" };

function abilityPlan(text: string | null): AbilityPlan {
  if (text === null) return { kind: "unknown", scope: "both" };
  if (!hasHp(text)) return { kind: "none" };
  const setter = /^The maximum HP (?:of each of your (.+?) in play|for each (.+?) you have in play) is (?:now )?(\d+)\.$/i.exec(text.trim());
  if (setter) return { kind: "set-named", name: normalizeText(setter[1] ?? setter[2]), value: Number(setter[3]) };
  // These phrases read remaining/printed HP as a condition or damage outcome;
  // they do not change maximum HP. Any other HP clause remains unmodelled.
  const withoutReferences = text
    .replace(/\b(?:remaining|full) HP\b/gi, "health")
    .replace(/\bHP (?:remaining|left)\b/gi, "health")
    .replace(/\b(?:maximum )?HP of \d+ or (?:more|less)\b/gi, "health threshold")
    .replace(/\b\d+ HP or (?:more|less)\b/gi, "health threshold");
  if (!hasHp(withoutReferences)) return { kind: "none" };
  const scope = /^(?:This Pok[eé]mon gets|If this Pok[eé]mon .+? (?:it gets|its maximum HP)|As long as .+?this Pok[eé]mon)/i.test(text)
    ? "self" : /^(?:Each of your|All of your|Your) /i.test(text) ? "own" : "both";
  return { kind: "unknown", scope };
}

/** One compiler owns these caches. Frames clone game state, never catalogue data. */
export function createReplayHpContext(evidence: CardDefinitionEvidenceByName | undefined, declaredFormat?: string, selfEvidence?: ReplayLinkedCardDefinitions) {
  const originalEvidence = evidence;
  const originalIndex = new Map(Object.entries(evidence ?? {}).map(([name, found]) => [name, found.candidates]));
  const selfIndex = new Map(Object.entries(selfEvidence ?? {}).map(([name, found]) => [name, found.candidates]));
  // Apply the saved format once; this same candidate set feeds HP and visual identity.
  if (declaredFormat && evidence) evidence = Object.fromEntries(Object.entries(evidence).map(([name, found]) => [name,
    resolveCardDefinition(new Map([[name, found.candidates]]), { name, declaredFormat }, found.coverage, found.generation, found.sourceCoverage)]));
  const normalized = new Map<string, string>();
  const normalize = (value: string) => {
    let result = normalized.get(value);
    if (result === undefined) { result = normalizeText(value); normalized.set(value, result); }
    return result;
  };
  const index = new Map(Object.entries(evidence ?? {}).map(([name, found]) => [name, found.candidates]));
  const resolutions = new Map<string, CardDefinitionEvidence | undefined>();
  const resolve = (card: Pick<ReplayCard, "name" | "observedEffects" | "setId" | "localId" | "definitionOwner">): CardDefinitionEvidence | undefined => {
    const name = normalize(card.name);
    const exactIdentity = Boolean(card.setId && card.localId);
    const linked = !exactIdentity && card.definitionOwner === "self" && selfEvidence !== undefined;
    const found = (exactIdentity ? originalEvidence : linked ? selfEvidence : evidence)?.[name];
    if (!found || !card.observedEffects?.length && !card.setId && !card.localId) return found;
    const effects = (card.observedEffects ?? []).map(normalize).sort();
    const key = JSON.stringify([name, effects, card.setId ?? null, card.localId ?? null, linked]);
    if (!resolutions.has(key)) resolutions.set(key, resolveCardDefinition(exactIdentity ? originalIndex : linked ? selfIndex : index,
      { name, effectNames: effects, setId: card.setId, localId: card.localId, declaredFormat }, found.coverage, found.generation, found.sourceCoverage));
    return resolutions.get(key);
  };
  const candidates = (found: CardDefinitionEvidence | undefined) => found?.coverage === "complete" && found.candidates.length ? found.candidates : null;
  const plans = new WeakMap<CardDefinition, AbilityPlan[]>();
  const getPlans = (definition: CardDefinition) => {
    let result = plans.get(definition);
    if (!result) {
      // The provider's completely absent Pokémon effect lists are incomplete
      // evidence, consistent with the printing resolver retaining this option.
      result = definition.category === "Pokemon" && !definition.abilities.length && !definition.attacks.length
        ? [{ kind: "unknown", scope: "both" }]
        : definition.abilities.map((ability) => abilityPlan(ability.text));
      plans.set(definition, result);
    }
    return result;
  };
  // The same source/target candidate arrays recur across hundreds of snapshots.
  const modifierCache = new Map<ModifierScope, Map<CardDefinition[] | null, Map<CardDefinition[] | null, number | null>>>();
  const modifier = (source: CardDefinition[] | null, targets: CardDefinition[] | null, scope: ModifierScope) => {
    let sources = modifierCache.get(scope);
    if (!sources) { sources = new Map(); modifierCache.set(scope, sources); }
    let targetsCache = sources.get(source);
    if (!targetsCache) { targetsCache = new Map(); sources.set(source, targetsCache); }
    if (!targetsCache.has(targets)) targetsCache.set(targets, rulesHpModifier(source, targets, scope));
    return targetsCache.get(targets)!;
  };
  const abilityCache = new Map<CardDefinition[] | null, Map<string, HpEffect | null>>();
  const abilityEffect = (source: CardDefinition[] | null, target: ReplayCard, sameOwner: boolean, sameCard: boolean): HpEffect | null => {
    let cached = abilityCache.get(source);
    if (!cached) { cached = new Map(); abilityCache.set(source, cached); }
    const targetName = normalize(target.name);
    const key = JSON.stringify([targetName, sameOwner, sameCard]);
    if (cached.has(key)) return cached.get(key)!;
    const values = source?.map((definition): HpEffect | null => {
      let set: number | undefined;
      for (const plan of getPlans(definition)) {
        if (plan.kind === "unknown" && (plan.scope === "both" || plan.scope === "own" && sameOwner || plan.scope === "self" && sameCard)) return null;
        if (plan.kind === "set-named" && sameOwner && plan.name === targetName) {
          if (set !== undefined && set !== plan.value) return null;
          set = plan.value;
        }
      }
      return set === undefined ? { add: 0 } : { add: 0, set };
    });
    const result = values?.length && values[0] !== null && values.every((value) => value !== null && value.add === values[0]!.add && value.set === values[0]!.set) ? values[0] : null;
    cached.set(key, result);
    return result;
  };
  const suppressionCache = new WeakMap<CardDefinition, Array<{ basicOnly: boolean; needsTool: boolean }>>();
  const suppressionModes = (definition: CardDefinition) => {
    let result = suppressionCache.get(definition);
    if (!result) {
      result = [...(definition.rules ?? []), ...definition.abilities.map((ability) => ability.text ?? "")]
        .filter((text) => /(?:has|have) no Abilities|can['’]?t use (?:any )?Abilities/i.test(text)
          || /\b(?:ignore|disable) (?:all )?Pok[eé]-(?:Bodies|Powers)\b|Pok[eé]-(?:Bodies|Powers) (?:are disabled|have no effect)/i.test(text))
        .map((text) => ({
          basicOnly: /^Each Basic Pok[eé]mon in play[, ].+? has no Abilities\.$/i.test(text)
            || /\bIgnore (?:all )?Pok[eé]-(?:Bodies|Powers) for all Basic Pok[eé]mon in play\b/i.test(text),
          needsTool: /^If this Pok[eé]mon has a Pok[eé]mon Tool card attached to it, .+? has no Abilities/i.test(text),
        }));
      suppressionCache.set(definition, result);
    }
    return result;
  };
  const candidateSuppressionCache = new WeakMap<CardDefinition[], Array<{ basicOnly: boolean; needsTool: boolean }>>();
  const candidateSuppressions = (options: CardDefinition[] | null) => {
    if (!options) return [];
    let result = candidateSuppressionCache.get(options);
    if (!result) {
      result = [...new Map(options.flatMap(suppressionModes).map((mode) => [`${mode.basicOnly}:${mode.needsTool}`, mode])).values()];
      candidateSuppressionCache.set(options, result);
    }
    return result;
  };
  const mentionsToolSuppression = (text: string) => /\bTools?(?: cards?)?\b[^.]*\b(?:has|have) no effect\b/i.test(text);
  const possibleToolSuppressionCache = new WeakMap<CardDefinition[], boolean>();
  const abilityToolSuppressionCache = new WeakMap<CardDefinition[], boolean>();
  const possibleToolSuppression = (options: CardDefinition[] | null, attached: boolean) => {
    if (!options) return attached;
    if (!attached) {
      if (!abilityToolSuppressionCache.has(options)) abilityToolSuppressionCache.set(options,
        options.some((definition) => definition.abilities.some((ability) => ability.text !== null && mentionsToolSuppression(ability.text))));
      return abilityToolSuppressionCache.get(options)!;
    }
    if (!possibleToolSuppressionCache.has(options)) possibleToolSuppressionCache.set(options,
      options.some((definition) => definition.rules === null || definition.rules.some(mentionsToolSuppression)));
    return possibleToolSuppressionCache.get(options)!;
  };
  const toolsSuppressedCache = new WeakMap<CardDefinition[], boolean | null>();
  const toolsSuppressed = (options: CardDefinition[] | null) => {
    if (!options) return false;
    if (toolsSuppressedCache.has(options)) return toolsSuppressedCache.get(options)!;
    const values = options.map((definition) => definition.rules === null ? null : definition.rules.some((text) =>
      /^(?:Pok[eé]mon Tools attached to each Pok[eé]mon|Pok[eé]mon Tool cards in play) \(both yours and your opponent['’]s\) have no effect\.$/i.test(text)
      || /^Each Pok[eé]mon Tool card in play has no effect\.$/i.test(text)) ? true
      : definition.rules.some(mentionsToolSuppression) ? null : false);
    const result = values.every((value) => value === values[0]) ? values[0] : null;
    toolsSuppressedCache.set(options, result);
    return result;
  };
  const abilityTextsCache = new Map<string, string[] | null>();
  const abilityTexts = (name: string, effect: string, definitionOwner?: "self" | "opponent"): string[] | null => {
    const key = JSON.stringify([normalize(name), normalize(effect), definitionOwner ?? null]);
    if (abilityTextsCache.has(key)) return abilityTextsCache.get(key)!;
    const found = resolve({ name, observedEffects: [effect], definitionOwner });
    const options = candidates(found);
    if (!options) { abilityTextsCache.set(key, null); return null; }
    const texts = options.map((definition) => definition.abilities.find((ability) => normalize(ability.name) === normalize(effect))?.text);
    const result = texts.every((text): text is string => typeof text === "string") ? texts : null;
    abilityTextsCache.set(key, result);
    return result;
  };
  const update = (state: ReplayState): void => {
    const board = (["self", "opponent"] as const).flatMap((actor) =>
      [state[actor].active, ...state[actor].bench, ...(state[actor].unplaced ?? [])].filter((card): card is ReplayCard => card !== null).map((card) => {
        card.definitionOwner = actor;
        return { actor, card, found: resolve(card) };
      }));
    const stadiumCandidates = state.stadium ? candidates(resolve({ name: state.stadium.name, definitionOwner: state.stadium.actor })) : null;
    const stadiumToolSuppression = toolsSuppressed(stadiumCandidates);
    const otherToolSuppression = board.some((origin) => possibleToolSuppression(candidates(origin.found), false)
      || Boolean(origin.card.tool && possibleToolSuppression(candidates(resolve({ name: origin.card.tool, definitionOwner: origin.actor })), true)));
    const toolSuppression = stadiumToolSuppression === true ? true : stadiumToolSuppression === null || otherToolSuppression ? null : false;
    const suppressions = [
      ...candidateSuppressions(stadiumCandidates),
      ...board.flatMap((origin) => candidateSuppressions(candidates(origin.found))
        .filter((mode) => !mode.needsTool || Boolean(origin.card.tool) || state[origin.actor].uncertainZones?.includes("board"))),
    ];
    const abilityMayBeSuppressed = (found: CardDefinitionEvidence | undefined) => suppressions.some((mode) =>
      !mode.basicOnly || !(candidates(found)?.every((definition) => definition.stage !== null && normalize(definition.stage) !== "basic")));
    for (const { actor, card, found } of board) {
      const targets = candidates(found);
      card.baseHp = found?.coverage === "complete" && Number.isSafeInteger(found.hp) && found.hp! > 0 ? found.hp : null;
      let abilitySet: number | undefined;
      let abilityUnknown = false;
      for (const origin of board) {
        const effect = abilityEffect(candidates(origin.found), card, actor === origin.actor, card.id === origin.card.id);
        if (!effect) { abilityUnknown = true; break; }
        if (effect.set !== undefined) {
          // An uncertain physical copy may no longer supply this setter. Its
          // presence is immaterial only when the target's printed HP is the same.
          if (origin.card.instanceUncertain && effect.set !== card.baseHp) { abilityUnknown = true; break; }
          // Ability suppression and historical Poké-Power/Body interactions
          // require an active-effect model. Do not assert a setter is active.
          if (abilityMayBeSuppressed(origin.found)) { abilityUnknown = true; break; }
          if (abilitySet !== undefined && abilitySet !== effect.set) { abilityUnknown = true; break; }
          abilitySet = effect.set;
        }
      }
      const unknownModifiers = (["self", "opponent"] as const).some((owner) => state[owner].hpModifiersKnown === false
        || state[owner].hpModifiersKnown === undefined && owner === actor && state[owner].uncertainZones?.includes("board"));
      let adjustment: number | null = abilityUnknown || card.instanceUncertain || unknownModifiers ? null
        : state.stadium ? modifier(stadiumCandidates, targets, "stadium") : 0;
      for (const attachment of [...(card.tool ? [card.tool] : []), ...card.energy.filter((energy) => /Energy$/i.test(energy) && !/^Basic /i.test(energy))]) {
        const addition = attachment === card.tool && toolSuppression !== false
          ? toolSuppression === true ? 0 : null
          : modifier(candidates(resolve({ name: attachment, definitionOwner: actor })), targets, "attachment");
        adjustment = adjustment === null || addition === null ? null : adjustment + addition;
      }
      const base = abilitySet ?? card.baseHp;
      card.maxHp = base === null || adjustment === null ? null : base + adjustment;
      card.hp = card.maxHp;
      card.remainingHp = card.maxHp === null || card.damageKnown === false ? null : Math.max(0, card.maxHp - card.damage);
    }
  };
  const cardResolutions: Record<string, ReplayCardResolution> = {};
  const decorateCard = (card: ReplayZoneCard & { observedEffects?: string[] }): void => {
    const found = resolve(card);
    const linked = card.definitionOwner === "self" && selfEvidence !== undefined && !(card.setId && card.localId);
    const key = JSON.stringify([normalize(card.name), [...(card.observedEffects ?? [])].map(normalize).sort(), card.setId ?? null, card.localId ?? null, linked]);
    card.definitionKey = key;
    if (Object.hasOwn(cardResolutions, key)) return;
    cardResolutions[key] = {
      name: card.name, coverage: found?.coverage ?? "unavailable", generation: found?.generation ?? null,
      resolution: found?.resolution ?? "missing", candidatePrintingIds: found?.candidatePrintingIds ?? found?.candidates.map((candidate) => candidate.sourceCardId) ?? [],
      selectedPrinting: found?.selectedPrinting ?? null, displayBasis: found?.displayBasis ?? "unavailable",
      agreedFacts: found?.agreedFacts ?? {}, ...(found?.formatBasis ? { formatBasis: found.formatBasis } : {}),
      selectedDefinition: found?.candidates.length ? selectCardDefinitionPrinting(found.candidates) : null,
      ...(linked ? { evidenceBasis: "linked_deck_list" as const } : {}),
    };
  };
  const decorateState = (state: ReplayState): void => {
    const visit = (card: ReplayZoneCard & { observedEffects?: string[]; underlying?: ReplayZoneCard[] }, actor: "self" | "opponent") => {
      card.definitionOwner = actor;
      decorateCard(card);
      card.underlying?.forEach((underlying) => visit(underlying, actor));
    };
    for (const actor of ["self", "opponent"] as const) {
      if (state[actor].active) visit(state[actor].active!, actor);
      state[actor].bench.forEach((card) => visit(card, actor));
      state[actor].unplaced?.forEach((card) => visit(card, actor));
      state[actor].knownHand.forEach((card) => visit(card, actor));
      state[actor].discard.forEach((card) => visit(card, actor));
    }
    if (state.playedCard) visit(state.playedCard.card, state.playedCard.actor);
    if (state.stadium) {
      const card = { ...state.stadium, id: "stadium", definitionOwner: state.stadium.actor };
      decorateCard(card);
      state.stadium.definitionKey = card.definitionKey;
    }
  };
  const effectConstraints = (card: Pick<ReplayCard, "name" | "observedEffects" | "setId" | "localId" | "definitionOwner">, effectName: string | undefined, kind: ReplayEffectKind, operation: ReplayEffectOperation) =>
    resolveReplayEffectConstraint(resolve({ ...card, ...(effectName ? { observedEffects: [...(card.observedEffects ?? []), effectName] } : {}) }), effectName, kind, operation);
  return { resolve, update, abilityTexts, effectConstraints, decorateCard, decorateState, collectResolutions: () => cardResolutions };
}

export function replayCardDefinitionEvidence(card: ReplayCard, evidence: CardDefinitionEvidenceByName | undefined) {
  return createReplayHpContext(evidence).resolve(card);
}
