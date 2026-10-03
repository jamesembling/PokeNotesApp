import { resolveCardDefinition, selectCardDefinitionPrinting } from "@/lib/card-definition-catalog/resolve";
import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinition, CardDefinitionEvidence, CardDefinitionEvidenceByName } from "@/lib/card-definition-catalog/types";
import type { ReplayActor, ReplayCard, ReplayCardResolution, ReplayEffectKind, ReplayState, ReplayZoneCard } from "./types";
import { resolveReplayEffectConstraint, resolveReplayTrainerDisposition, type ReplayEffectOperation } from "./effect-targets";
import type { ReplayLinkedCardDefinitions } from "./linked-deck-list";
import { applyReplayPrintingProofs, applyReplayPrintingProofToCard, type ReplayPrintingProof } from "./printing-proofs";

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
  if (!source) return 0;
  const values = source.flatMap((definition) => {
    if (definition.rules === null) return [0];
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
  if (text === null) return { kind: "none" };
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
export function createReplayHpContext(evidence: CardDefinitionEvidenceByName | undefined, declaredFormat?: string, selfEvidence?: ReplayLinkedCardDefinitions, playedOn?: string) {
  const playedDay = playedOn?.slice(0, 10);
  const validPlayedDay = playedDay && /^\d{4}-\d{2}-\d{2}$/.test(playedDay) && Number.isFinite(Date.parse(`${playedDay}T00:00:00Z`))
    && new Date(`${playedDay}T00:00:00Z`).toISOString().slice(0, 10) === playedDay ? playedDay : undefined;
  const originalEvidence = evidence;
  const originalIndex = new Map(Object.entries(evidence ?? {}).map(([name, found]) => [name, found.candidates]));
  const selfIndex = new Map(Object.entries(selfEvidence ?? {}).map(([name, found]) => [name, found.candidates]));
  // Apply game-time and format constraints once for unrecorded public choices.
  // Exact set/collector evidence continues to use the original catalogue below.
  if ((declaredFormat || validPlayedDay) && evidence) evidence = Object.fromEntries(Object.entries(evidence).map(([name, found]) => {
    const available = found.candidates.filter((printing) => !validPlayedDay || !printing.setReleaseDate || printing.setReleaseDate <= validPlayedDay);
    const resolved = resolveCardDefinition(new Map([[name, available]]), { name, declaredFormat }, found.coverage, found.generation, found.sourceCoverage);
    return [name, validPlayedDay && available.some((printing) => !printing.setReleaseDate) && resolved.formatBasis?.status === "applied"
      ? { ...resolved, formatBasis: { ...resolved.formatBasis, status: "partial" as const } } : resolved];
  }));
  const normalized = new Map<string, string>();
  const normalize = (value: string) => {
    let result = normalized.get(value);
    if (result === undefined) { result = normalizeText(value); normalized.set(value, result); }
    return result;
  };
  const index = new Map(Object.entries(evidence ?? {}).map(([name, found]) => [name, found.candidates]));
  const resolutions = new Map<string, CardDefinitionEvidence | undefined>();
  const usesLinked = (card: Pick<ReplayCard, "name" | "setId" | "localId" | "definitionOwner">) => {
    const linked = selfEvidence?.[normalize(card.name)];
    return !(card.setId && card.localId) && card.definitionOwner === "self"
      && linked?.coverage === "complete" && linked.candidates.some((printing) => !validPlayedDay || !printing.setReleaseDate || printing.setReleaseDate <= validPlayedDay);
  };
  const resolve = (card: Pick<ReplayCard, "name" | "observedEffects" | "setId" | "localId" | "definitionOwner">): CardDefinitionEvidence | undefined => {
    const name = normalize(card.name);
    const exactIdentity = Boolean(card.setId && card.localId);
    const linked = usesLinked(card);
    const found = (exactIdentity ? originalEvidence : linked ? selfEvidence : evidence)?.[name];
    if (!found || !card.observedEffects?.length && !card.setId && !card.localId) return found;
    const effects = (card.observedEffects ?? []).map(normalize).sort();
    const key = JSON.stringify([name, effects, card.setId ?? null, card.localId ?? null, linked]);
    if (!resolutions.has(key)) {
      const resolved = resolveCardDefinition(exactIdentity ? originalIndex : linked ? selfIndex : index,
        { name, effectNames: effects, setId: card.setId, localId: card.localId, declaredFormat: linked ? undefined : declaredFormat }, found.coverage, found.generation, found.sourceCoverage);
      resolutions.set(key, linked && found.formatBasis ? { ...resolved, formatBasis: found.formatBasis } : resolved);
    }
    return resolutions.get(key);
  };
  // Positional proof affects the visible definition query only. The public
  // resolver used by physical proof collection remains native-evidence-only.
  const displayCard = (card: ReplayZoneCard) => card.activeEpisodeId && card.activePrintingEffects?.episodeId === card.activeEpisodeId
    ? { ...card, observedEffects: [...new Set([...(card.observedEffects ?? []), ...card.activePrintingEffects.effects])] } : card;
  const candidates = (found: CardDefinitionEvidence | undefined) => found?.coverage === "complete" && found.candidates.length ? found.candidates : null;
  const modifierCandidates = (found: CardDefinitionEvidence | undefined) => found?.candidates.length ? found.candidates : null;
  const attachmentFallbacks = new Map<string, CardDefinitionEvidence>();
  const attachmentRulesUnverified = (found: CardDefinitionEvidence | undefined) =>
    !found?.candidates.length || found.coverage !== "complete" || found.candidates.some((printing) => printing.rules === null);
  const attachmentKey = (name: string, owner?: "self" | "opponent") => JSON.stringify([normalize(name), owner ?? null]);
  const resolveAttachment = (name: string, owner?: "self" | "opponent") => {
    const found = resolve({ name, definitionOwner: owner });
    if (found?.candidates.length) return found;
    const key = attachmentKey(name, owner);
    if (attachmentFallbacks.has(key)) return attachmentFallbacks.get(key);
    const original = originalEvidence?.[normalize(name)];
    const available = original?.candidates.filter((printing) => (!validPlayedDay || !printing.setReleaseDate || printing.setReleaseDate <= validPlayedDay)
      && (printing.category === "Energy" || printing.category === "Trainer" && normalize(printing.trainerType ?? "") === "tool"));
    if (!original || !available?.length) return found;
    // A named attachment was recorded in play. A stale format label cannot
    // make its agreed printed modifier vanish; its printing remains representative.
    const resolved = resolveCardDefinition(new Map([[normalize(name), available]]), { name }, original.coverage, original.generation, original.sourceCoverage);
    const fallback = { ...resolved, ...(found?.formatBasis ? { formatBasis: { ...found.formatBasis,
      status: found.formatBasis.status === "unsupported" ? "unsupported" as const : "conflicting" as const } } : {}) };
    attachmentFallbacks.set(key, fallback);
    return fallback;
  };
  type HpSelection = { hp: number | null; basis: "known" | "probable" | "unknown"; selected: CardDefinition | null; probableBasis?: "linked_deck_list" | "latest_format_candidate" };
  const selectionCache = new WeakMap<CardDefinitionEvidence, Map<boolean, HpSelection>>();
  const hpSelection = (card: Pick<ReplayCard, "name" | "observedEffects" | "setId" | "localId" | "definitionOwner">, found: CardDefinitionEvidence | undefined): HpSelection => {
    if (!found) return { hp: null, basis: "unknown", selected: null };
    const linked = usesLinked(card);
    let cached = selectionCache.get(found);
    if (!cached) { cached = new Map(); selectionCache.set(found, cached); }
    if (cached.has(linked)) return cached.get(linked)!;
    const publicHp = linked ? resolve({ ...card, definitionOwner: undefined })?.hp : found.hp;
    const recorded = Boolean(card.setId && card.localId && found.candidates.length === 1 && Number.isSafeInteger(found.candidates[0].hp) && found.candidates[0].hp! > 0);
    const agreed = recorded || found.coverage === "complete" && Number.isSafeInteger(found.hp) && found.hp! > 0;
    const available = recorded ? found.candidates : found.candidates.filter((printing) => !validPlayedDay || !printing.setReleaseDate || printing.setReleaseDate <= validPlayedDay);
    let selected = selectCardDefinitionPrinting(available);
    let hp = recorded ? found.candidates[0].hp : agreed ? found.hp : null;
    let basis: HpSelection["basis"] = recorded || agreed && publicHp === hp ? "known" : "unknown";
    if (basis !== "known") {
      // Choose by release date first. Available artwork cannot make an older
      // printing the best HP evidence. Format partiality remains in formatBasis.
      const options = available.filter((printing) => Number.isSafeInteger(printing.hp) && printing.hp! > 0);
      const latest = options.reduce((date, printing) => (printing.setReleaseDate ?? "") > date ? printing.setReleaseDate! : date, "");
      selected = selectCardDefinitionPrinting(options.filter((printing) => (printing.setReleaseDate ?? "") === latest)) ?? selected;
      hp = selected && options.includes(selected) ? selected.hp : null;
      basis = hp === null ? "unknown" : "probable";
    }
    const result: HpSelection = { hp, basis, selected, ...(basis === "probable" ? { probableBasis: linked ? "linked_deck_list" : "latest_format_candidate" } : {}) };
    cached.set(linked, result);
    return result;
  };
  const plans = new WeakMap<CardDefinition, AbilityPlan[]>();
  const getPlans = (definition: CardDefinition) => {
    let result = plans.get(definition);
    if (!result) {
      result = definition.abilities.map((ability) => abilityPlan(ability.text));
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
    if (!source) return { add: 0 };
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
    if (!options) return false;
    if (!attached) {
      if (!abilityToolSuppressionCache.has(options)) abilityToolSuppressionCache.set(options,
        options.some((definition) => definition.abilities.some((ability) => ability.text !== null && mentionsToolSuppression(ability.text))));
      return abilityToolSuppressionCache.get(options)!;
    }
    if (!possibleToolSuppressionCache.has(options)) possibleToolSuppressionCache.set(options,
      options.some((definition) => definition.rules?.some(mentionsToolSuppression)));
    return possibleToolSuppressionCache.get(options)!;
  };
  const toolsSuppressedCache = new WeakMap<CardDefinition[], boolean | null>();
  const toolsSuppressed = (options: CardDefinition[] | null) => {
    if (!options) return false;
    if (toolsSuppressedCache.has(options)) return toolsSuppressedCache.get(options)!;
    const values = options.map((definition) => definition.rules === null ? false : definition.rules.some((text) =>
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
        return { actor, card, found: resolve(displayCard(card)) };
      }));
    const stadiumCandidates = state.stadium ? modifierCandidates(resolve({ name: state.stadium.name, definitionOwner: state.stadium.actor })) : null;
    const stadiumToolSuppression = toolsSuppressed(stadiumCandidates);
    const otherToolSuppression = board.some((origin) => possibleToolSuppression(modifierCandidates(origin.found), false)
      || Boolean(origin.card.tool && possibleToolSuppression(modifierCandidates(resolveAttachment(origin.card.tool, origin.actor)), true)));
    const toolSuppression = stadiumToolSuppression === true ? true : stadiumToolSuppression === null || otherToolSuppression ? null : false;
    const suppressions = [
      ...candidateSuppressions(stadiumCandidates),
      ...board.flatMap((origin) => candidateSuppressions(modifierCandidates(origin.found))
        .filter((mode) => !mode.needsTool || Boolean(origin.card.tool) || state[origin.actor].uncertainZones?.includes("board"))),
    ];
    const abilityMayBeSuppressed = (found: CardDefinitionEvidence | undefined) => suppressions.some((mode) =>
      !mode.basicOnly || !(candidates(found)?.every((definition) => definition.stage !== null && normalize(definition.stage) !== "basic")));
    for (const { actor, card, found } of board) {
      const targets = modifierCandidates(found);
      const selection = hpSelection(displayCard(card), found);
      card.baseHp = selection.hp;
      let abilitySet: number | undefined;
      let abilityUnknown = false;
      for (const origin of board) {
        const effect = abilityEffect(modifierCandidates(origin.found), card, actor === origin.actor, card.id === origin.card.id);
        if (!effect) { abilityUnknown = true; break; }
        if (effect.set !== undefined) {
          // Ability suppression and historical Poké-Power/Body interactions
          // require an active-effect model. Do not assert a setter is active.
          if (abilityMayBeSuppressed(origin.found)) { abilityUnknown = true; break; }
          if (abilitySet !== undefined && abilitySet !== effect.set) { abilityUnknown = true; break; }
          abilitySet = effect.set;
        }
      }
      // Unclear damage, copy identity and unknown board entities do not establish
      // an HP-changing effect. Only a recorded modifier can obscure maximum HP.
      let adjustment: number | null = abilityUnknown || card.hpModifierUncertain ? null
        : state.stadium ? modifier(stadiumCandidates, targets, "stadium") : 0;
      let unverifiedAttachment = false;
      for (const attachment of [...(card.tool ? [card.tool] : []), ...card.energy.filter((energy) => /Energy$/i.test(energy) && !/^Basic /i.test(energy))]) {
        const attachmentFound = resolveAttachment(attachment, actor);
        if (!(attachment === card.tool && toolSuppression === true) && attachmentRulesUnverified(attachmentFound)) unverifiedAttachment = true;
        const printedAddition = modifier(modifierCandidates(attachmentFound), targets, "attachment");
        const addition = attachment === card.tool && toolSuppression !== false && printedAddition !== 0
          ? toolSuppression === true ? 0 : null : printedAddition;
        adjustment = adjustment === null || addition === null ? null : adjustment + addition;
      }
      for (const pool of state[actor].boardPools ?? []) {
        if (!pool.memberIds.includes(card.id)) continue;
        const applyComponent = (component: ReplayZoneCard, assignmentKnown: boolean) => {
          if (component.boardRole === "evolution" || /^Basic .+ Energy$/i.test(component.name)) return;
          const componentFound = component.setId && component.localId ? resolve(component) : resolveAttachment(component.name, actor);
          const source = modifierCandidates(componentFound);
          const isTool = component.boardRole === "tool" || source?.every((printing) => printing.category === "Trainer" && normalize(printing.trainerType ?? "") === "tool");
          const isEnergy = component.boardRole === "energy" || source?.every((printing) => printing.category === "Energy");
          if (!isTool && !isEnergy || isTool && toolSuppression === true) return;
          if (attachmentRulesUnverified(componentFound)) unverifiedAttachment = true;
          const printedAddition = modifier(source, targets, "attachment");
          const addition = isTool && toolSuppression === null && printedAddition !== 0 ? null : printedAddition;
          // A sole member resolves a guaranteed board component's assignment.
          // Conditional components may already have left play, even with one
          // member remaining, so a nonzero effect stays unresolved locally.
          if (assignmentKnown) adjustment = adjustment === null || addition === null ? null : adjustment + addition;
          else if (addition !== 0) adjustment = null;
        };
        pool.cards.forEach((component) => applyComponent(component, pool.memberIds.length === 1));
        pool.uncertainCards?.forEach((group) => group.cards.forEach((component) => applyComponent(component, false)));
      }
      const base = abilitySet ?? card.baseHp;
      card.maxHp = base === null || adjustment === null ? null : base + adjustment;
      card.hpBasis = card.maxHp === null ? "unknown" : unverifiedAttachment ? "probable" : abilitySet !== undefined ? "known" : selection.basis;
      if (unverifiedAttachment) card.hpModifierBasis = "unverified_attachment";
      else delete card.hpModifierBasis;
      card.hp = card.maxHp;
      card.remainingHp = card.maxHp === null || card.damageKnown === false ? null : Math.max(0, card.maxHp - card.damage);
    }
  };
  const cardResolutions: Record<string, ReplayCardResolution> = {};
  const decorateCard = (card: ReplayZoneCard & { observedEffects?: string[] }): void => {
    const query = displayCard(card);
    const resolved = resolve(query);
    const found = resolved?.candidates.length ? resolved : attachmentFallbacks.get(attachmentKey(card.name, card.definitionOwner)) ?? resolved;
    const selection = hpSelection(query, found);
    const linked = usesLinked(card);
    const key = JSON.stringify([normalize(card.name), [...(query.observedEffects ?? [])].map(normalize).sort(), card.setId ?? null, card.localId ?? null, linked]);
    card.definitionKey = key;
    if (Object.hasOwn(cardResolutions, key)) return;
    cardResolutions[key] = {
      name: card.name, coverage: found?.coverage ?? "unavailable", generation: found?.generation ?? null,
      resolution: found?.resolution ?? "missing", candidatePrintingIds: found?.candidatePrintingIds ?? found?.candidates.map((candidate) => candidate.sourceCardId) ?? [],
      selectedPrinting: selection.selected ? resolveCardDefinition(new Map([[normalize(card.name), [selection.selected]]]), { name: card.name }).selectedPrinting ?? null : null,
      displayBasis: selection.selected ? found?.displayBasis ?? "representative" : "unavailable",
      agreedFacts: found?.agreedFacts ?? {}, ...(found?.formatBasis ? { formatBasis: found.formatBasis } : {}),
      selectedDefinition: selection.selected, printedHp: selection.hp, hpBasis: selection.basis,
      ...(selection.probableBasis ? { probableHpBasis: selection.probableBasis } : {}),
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
      state[actor].boardPools?.forEach((pool) => {
        pool.cards.forEach((card) => visit(card, actor));
        pool.memberEvidence?.forEach((card) => visit(card, actor));
        pool.possiblyReturnedCards?.forEach((card) => visit(card, actor));
        pool.uncertainCards?.forEach((group) => group.cards.forEach((card) => visit(card, actor)));
      });
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
  const trainerDisposition = (card: Pick<ReplayCard, "name" | "observedEffects" | "setId" | "localId" | "definitionOwner">) => resolveReplayTrainerDisposition(resolve(card));
  const hasAttachmentHpModifier = (card: Pick<ReplayCard, "tool" | "energy" | "definitionOwner">): boolean =>
    [...(card.tool ? [card.tool] : []), ...card.energy.filter((energy) => /Energy$/i.test(energy) && !/^Basic /i.test(energy))]
      .some((name) => modifierCandidates(resolveAttachment(name, card.definitionOwner))?.some((printing) => printing.rules?.some((text) =>
        /\bgets? [＋+−-]\d+ HP\b|\b(?:maximum )?HP (?:is (?:now )?|becomes? |changes? to )\d+\b|\b(?:increase|reduce|decrease)(?:s|d)?\b[^.]*\b(?:maximum )?HP\b/i.test(text))) ?? false);
  const attackPrintingEvidence = (card: ReplayCard, attackName: string, state: ReplayState):
    | { status: "native"; observedEffect: string }
    | { status: "copied"; observedEffect: string; definitionCard: ReplayCard }
    | { status: "unmodelled" } => {
    const options = candidates(resolve(card));
    if (!options) return { status: "unmodelled" };
    const attack = normalize(attackName);
    const copyAbilities = options.map((printing) => printing.abilities.filter((ability) => ability.text !== null
      && /^This Pok[eé]mon can use the attacks of any of your Benched Pok[eé]mon\.\s*(?:\(You still need the necessary Energy to use each attack\.\))?$/i.test(ability.text)));
    const native = options.some((printing) => printing.attacks.some((printed) => normalize(printed.name) === attack));
    if (native && copyAbilities.every((abilities) => !abilities.length)) return { status: "native", observedEffect: attackName };
    if (options.every((printing) => printing.attacks.some((printed) => normalize(printed.name) === attack))) return { status: "native", observedEffect: attackName };
    if (!copyAbilities.every((abilities) => abilities.length === 1 && normalize(abilities[0].name) === normalize(copyAbilities[0][0]?.name ?? ""))) return { status: "unmodelled" };
    const owner = card.definitionOwner ?? (["self", "opponent"] as const).find((actor) =>
      state[actor].active?.id === card.id || state[actor].bench.some((copy) => copy.id === card.id));
    if (!owner) return { status: "unmodelled" };
    const donors = state[owner].bench.flatMap((donor) => {
      const printings = candidates(resolve(donor));
      if (!printings) return [];
      const attacks = printings.map((printing) => printing.attacks.find((printed) => normalize(printed.name) === attack));
      return attacks.every((printed) => printed !== undefined && JSON.stringify(printed) === JSON.stringify(attacks[0]))
        ? [{ card: donor, attack: attacks[0]! }] : [];
    });
    if (!donors.length || !donors.every((donor) => JSON.stringify(donor.attack) === JSON.stringify(donors[0].attack))) return { status: "unmodelled" };
    // The donor supplies printed attack text. Its owner/physical identity never
    // replaces the Pokémon executing that text or receiving "this Pokémon" effects.
    return { status: "copied", observedEffect: copyAbilities[0][0].name, definitionCard: donors[0].card };
  };
  const applyPrintingProofs = (state: ReplayState, frameIndex: number, plan: readonly ReplayPrintingProof[]) =>
    applyReplayPrintingProofs(plan, state, frameIndex, resolve);
  const applyPrintingProofToCard = (card: ReplayZoneCard, actor: ReplayActor, frameIndex: number, plan: readonly ReplayPrintingProof[]) =>
    applyReplayPrintingProofToCard(plan, card, actor, frameIndex, resolve);
  return { resolve, update, abilityTexts, effectConstraints, trainerDisposition, attackPrintingEvidence, hasAttachmentHpModifier, decorateCard, decorateState, applyPrintingProofs, applyPrintingProofToCard, collectResolutions: () => cardResolutions };
}

export function replayCardDefinitionEvidence(card: ReplayCard, evidence: CardDefinitionEvidenceByName | undefined) {
  return createReplayHpContext(evidence).resolve(card);
}
