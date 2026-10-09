import { resolveCardDefinition, selectCardDefinitionPrinting } from "@/lib/card-definition-catalog/resolve";
import { cardDefinitionAvailability, cardDefinitionPlayedDay } from "@/lib/card-definition-catalog/legality.mjs";
import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinition, CardDefinitionEvidence, CardDefinitionEvidenceByName } from "@/lib/card-definition-catalog/types";
import type { ReplayActor, ReplayCard, ReplayCardResolution, ReplayEffectKind, ReplayProgram, ReplayState, ReplayZoneCard } from "./types";
import { resolveReplayEffectConstraint, resolveReplayTrainerDisposition, type ReplayEffectOperation } from "./effect-targets";
import type { ReplayLinkedCardDefinitions } from "./linked-deck-list";
import { applyReplayPrintingProofs, applyReplayPrintingProofToCard, type ReplayPrintingProof } from "./printing-proofs";
import { isReplaySelfAttackPermission } from "./ability-eligibility";
import { replayAttachmentCards } from "./preview";

const hasHp = (text: string) => /\bHP\b/i.test(text);

type ModifierScope = "attachment" | "stadium";
export type ReplayAttackRouteContext = { card: ReplayZoneCard; effect?: string; kind: "trainer" | "ability" | "attack" };

function appliesTo(selector: string, card: CardDefinition): boolean | null {
  // Catalogue rules spell types either as names or printed Energy symbols.
  // Expand only recognized symbols; unsupported predicates remain unknown.
  const symbols: Record<string, string> = { D: "Darkness", F: "Fighting", G: "Grass", L: "Lightning", M: "Metal", P: "Psychic", R: "Fire", W: "Water", Y: "Fairy", N: "Dragon", C: "Colorless" };
  const selected = normalizeText(selector.replace(/\{([DFGLMPRWYNC])\}/gi, (_, symbol: string) => symbols[symbol.toUpperCase()]));
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
  const validPlayedDay = cardDefinitionPlayedDay(playedOn);
  const originalEvidence = evidence;
  const originalIndex = new Map(Object.entries(evidence ?? {}).map(([name, found]) => [name, found.candidates]));
  const selfIndex = new Map(Object.entries(selfEvidence ?? {}).map(([name, found]) => [name, found.candidates]));
  // Apply game-time and format constraints once for unrecorded public choices.
  // Exact set/collector evidence continues to use the original catalogue below.
  if (evidence) evidence = Object.fromEntries(Object.entries(evidence).map(([name, found]) => {
    if (!declaredFormat && !validPlayedDay && !found.sourceCoverage) return [name, found];
    return [name, resolveCardDefinition(originalIndex, { name, declaredFormat, playedOn }, found.coverage, found.generation, found.sourceCoverage)];
  }));
  const normalized = new Map<string, string>();
  const normalize = (value: string) => {
    let result = normalized.get(value);
    if (result === undefined) { result = normalizeText(value); normalized.set(value, result); }
    return result;
  };

  const resolutions = new Map<string, CardDefinitionEvidence | undefined>();
  const usesLinked = (card: Pick<ReplayCard, "name" | "setId" | "localId" | "definitionOwner">) => {
    const linked = selfEvidence?.[normalize(card.name)];
    return !(card.setId && card.localId) && card.definitionOwner === "self"
      && linked?.coverage === "complete" && linked.candidates.some((printing) => !validPlayedDay || cardDefinitionAvailability(printing, playedOn).status === "available");
  };
  const resolve = (card: Pick<ReplayCard, "name" | "observedEffects" | "setId" | "localId" | "definitionOwner">): CardDefinitionEvidence | undefined => {
    const name = normalize(card.name);
    const exactIdentity = Boolean(card.setId && card.localId);
    const linked = usesLinked(card);
    const found = (exactIdentity ? originalEvidence : linked ? selfEvidence : evidence)?.[name];
    const source = (linked ? selfEvidence : originalEvidence)?.[name];
    if (!found || !source || !card.observedEffects?.length && !card.setId && !card.localId) return found;
    const effects = (card.observedEffects ?? []).map(normalize).sort();
    const key = JSON.stringify([name, effects, card.setId ?? null, card.localId ?? null, linked]);
    if (!resolutions.has(key)) {
      const resolved = resolveCardDefinition(linked ? selfIndex : originalIndex,
        { name, effectNames: effects, setId: card.setId, localId: card.localId, declaredFormat, playedOn }, source.coverage, found.generation, found.sourceCoverage);
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
  const attachmentRulesUnverified = (found: CardDefinitionEvidence | undefined) =>
    !found?.candidates.length || found.coverage !== "complete" || found.candidates.some((printing) => printing.rules === null);
  const resolveAttachment = (name: string, owner?: "self" | "opponent", holder?: ReplayCard) => {
    const recorded = holder ? replayAttachmentCards(holder).filter((card) => card.name === name) : [];
    const printing = recorded.length && recorded.every((card) => card.setId === recorded[0].setId && card.localId === recorded[0].localId) ? recorded[0] : undefined;
    return resolve({ ...printing, name, definitionOwner: owner });
  };
  type HpSelection = { hp: number | null; basis: "known" | "probable" | "unknown"; selected: CardDefinition | null; preferredFamily?: boolean; probableBasis?: "linked_deck_list" | "latest_format_candidate" | "same_owner_witnessed_family" };
  let selectionCache = new WeakMap<CardDefinitionEvidence, Map<string, HpSelection>>();
  // Populated only after semantic reconstruction. No execution lookup sees
  // this same-owner display preference or its selected representative.
  const seenFamilies = new Map<string, string | null>();
  const familyKey = (card: CardDefinition) => JSON.stringify([card.hp, card.category, card.trainerType, card.stage, card.types,
    card.evolvesFrom, card.rules, card.abilities, card.attacks, card.additionalPassiveTraits ?? null, card.energyType ?? null]);
  const ownerName = (actor: ReplayActor, name: string) => JSON.stringify([actor, normalize(name)]);
  const hpSelection = (card: Pick<ReplayCard, "name" | "observedEffects" | "setId" | "localId" | "definitionOwner">, found: CardDefinitionEvidence | undefined): HpSelection => {
    if (!found) return { hp: null, basis: "unknown", selected: null };
    const linked = usesLinked(card);
    let cached = selectionCache.get(found);
    if (!cached) { cached = new Map(); selectionCache.set(found, cached); }
    const selectionKey = JSON.stringify([linked, card.definitionOwner ?? null]);
    if (cached.has(selectionKey)) return cached.get(selectionKey)!;
    const publicHp = linked ? resolve({ ...card, definitionOwner: undefined })?.hp : found.hp;
    const recorded = Boolean(found.coverage === "complete" && card.setId && card.localId && found.candidates.length === 1 && Number.isSafeInteger(found.candidates[0].hp) && found.candidates[0].hp! > 0);
    const agreed = recorded || found.coverage === "complete" && Number.isSafeInteger(found.hp) && found.hp! > 0;
    const available = recorded ? found.candidates : found.candidates.filter((printing) => !validPlayedDay || cardDefinitionAvailability(printing, playedOn).status === "available");
    const knownLegalIds = new Set(found.formatBasis?.legalPrintingIds ?? []);
    const displayAvailable = !recorded && found.formatBasis && found.formatBasis.status !== "unsupported" ? available.filter((printing) => knownLegalIds.has(printing.sourceCardId)) : available;
    let selected = selectCardDefinitionPrinting(displayAvailable);
    let hp = recorded ? found.candidates[0].hp : agreed ? found.hp : null;
    let basis: HpSelection["basis"] = recorded || agreed && publicHp === hp ? "known" : "unknown";
    if (basis !== "known") {
      // Choose by release date first. Available artwork cannot make an older
      // printing the best HP evidence. Format partiality remains in formatBasis.
      const legalIds = new Set(found.formatBasis?.legalPrintingIds ?? []);
      const preferredLegal = found.formatBasis && found.formatBasis.status !== "unsupported" ? available.filter((printing) => legalIds.has(printing.sourceCardId)) : available;
      const options = preferredLegal.filter((printing) => Number.isSafeInteger(printing.hp) && printing.hp! > 0);
      const latest = options.reduce((date, printing) => (printing.setReleaseDate ?? "") > date ? printing.setReleaseDate! : date, "");
      selected = selectCardDefinitionPrinting(options.filter((printing) => (printing.setReleaseDate ?? "") === latest)) ?? selected;
      hp = selected && options.includes(selected) ? selected.hp : null;
      basis = hp === null ? "unknown" : "probable";
    }
    const witnessedFamily = card.definitionOwner && !linked && !card.observedEffects?.length && !card.setId && !card.localId
      ? seenFamilies.get(ownerName(card.definitionOwner, card.name)) : undefined;
    const preferred = witnessedFamily && found.coverage === "complete"
      ? selectCardDefinitionPrinting(displayAvailable.filter((printing) => familyKey(printing) === witnessedFamily && Number.isSafeInteger(printing.hp) && printing.hp! > 0)) : null;
    if (preferred) { selected = preferred; hp = preferred.hp; }
    const result: HpSelection = { hp, basis, selected, ...(preferred ? { preferredFamily: true } : {}), ...(basis === "probable" ? { probableBasis: preferred ? "same_owner_witnessed_family" : linked ? "linked_deck_list" : "latest_format_candidate" } : {}) };
    cached.set(selectionKey, result);
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
  const abilityTexts = (name: string, effect: string, definitionOwner?: "self" | "opponent", identity?: Pick<ReplayZoneCard, "setId" | "localId">): string[] | null => {
    const key = JSON.stringify([normalize(name), normalize(effect), definitionOwner ?? null, identity?.setId, identity?.localId]);
    if (abilityTextsCache.has(key)) return abilityTextsCache.get(key)!;
    const found = resolve({ name, observedEffects: [effect], definitionOwner, ...identity });
    const options = candidates(found);
    if (!options) { abilityTextsCache.set(key, null); return null; }
    const texts = options.map((definition) => definition.abilities.find((ability) => normalize(ability.name) === normalize(effect))?.text);
    const result = texts.every((text): text is string => typeof text === "string") ? texts : null;
    abilityTextsCache.set(key, result);
    return result;
  };
  const printedBaseDependency = new WeakMap<ReplayZoneCard, boolean>();
  const copySnapshotHpProvenance = (cards: ReplayZoneCard[], snapshots: ReplayZoneCard[]) => cards.forEach((card, index) => {
    if (printedBaseDependency.has(card)) printedBaseDependency.set(snapshots[index], printedBaseDependency.get(card)!);
  });
  const update = (state: ReplayState): void => {
    const board = (["self", "opponent"] as const).flatMap((actor) =>
      [state[actor].active, ...state[actor].bench, ...(state[actor].unplaced ?? [])].filter((card): card is ReplayCard => card !== null).map((card) => {
        card.definitionOwner = actor;
        return { actor, card, found: resolve(displayCard(card)) };
      }));
    const stadiumCandidates = state.stadium ? modifierCandidates(resolve({ ...state.stadium, definitionOwner: state.stadium.actor })) : null;
    const stadiumToolSuppression = toolsSuppressed(stadiumCandidates);
    const otherToolSuppression = board.some((origin) => possibleToolSuppression(modifierCandidates(origin.found), false)
      || Boolean(origin.card.tool && possibleToolSuppression(modifierCandidates(resolveAttachment(origin.card.tool, origin.actor, origin.card)), true)));
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
        const attachmentFound = resolveAttachment(attachment, actor, card);
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
      printedBaseDependency.set(card, abilitySet === undefined);
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
    const found = resolved;
    const selection = hpSelection(query, found);
    const linked = usesLinked(card);
    const queryKey = [normalize(card.name), [...(query.observedEffects ?? [])].map(normalize).sort(), card.setId ?? null, card.localId ?? null, linked];
    const key = JSON.stringify(selection.preferredFamily ? [...queryKey, card.definitionOwner] : queryKey);
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
      ...(selection.preferredFamily ? { printingPreferenceBasis: "same_owner_witnessed_family" as const } : {}),
      ...(linked ? { evidenceBasis: "linked_deck_list" as const } : {}),
    };
  };
  const decorateState = (state: ReplayState): void => {
    const visit = (card: ReplayZoneCard & { observedEffects?: string[]; underlying?: ReplayZoneCard[] }, actor: "self" | "opponent") => {
      card.definitionOwner = actor;
      decorateCard(card);
      card.underlying?.forEach((underlying) => visit(underlying, actor));
      if ("energy" in card) {
        const top = card as ReplayCard;
        if (top.attachmentCards) top.attachmentCards = replayAttachmentCards(top);
        top.attachmentCards?.forEach((attachment) => visit(attachment, actor));
      }
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
  const attackPrintingEvidence = (card: ReplayCard, attackName: string, state: ReplayState, history: readonly ReplayAttackRouteContext[] = []):
    | { status: "native"; observedEffect: string }
    | { status: "copied"; observedEffect?: string; definitionCard: ReplayCard }
    | { status: "unmodelled" } => {
    // Enumerate routes from the existing native domain, before adding the
    // executed name. Native and borrowed attacks may share a name but differ.
    const options = candidates(resolve(card));
    if (!options) return { status: "unmodelled" };
    const attack = normalize(attackName);
    const owner = card.definitionOwner ?? (["self", "opponent"] as const).find((actor) =>
      [state[actor].active, ...state[actor].bench, ...(state[actor].unplaced ?? [])].some((copy) => copy?.id === card.id));
    if (!owner) return { status: "unmodelled" };
    const tops = (actor: ReplayActor) => [state[actor].active, ...state[actor].bench, ...(state[actor].unplaced ?? [])].filter((top): top is ReplayCard => Boolean(top));
    const copyLike = (text: string) => /(?:can|may|able to) use (?:the |any |all )?attacks?\b|use[^.]*attacks?[^.]*as (?:its|their|your) own|(?:has|have|gains?|choose|use) (?:the |an? |this |that |following )*attacks?\b|use[^.]*VSTAR Power/i.test(text.replace(/\b(?:may|can) use an attack it has twice\b/gi, "repeat its native attack"));
    const hasCopyPermission = options.some((printing) => [...(printing.rules ?? []), ...printing.abilities.map((ability) => ability.text ?? "")].some(copyLike));
    const permission = (text: string): "bench" | "in_play" | null => {
      const body = text.replace(/\s*\(You still need the necessary Energy to use each attack\.\)\s*$/i, "").trim();
      if (/^This Pok[eé]mon can use the attacks of any of your Benched Pok[eé]mon\.$/i.test(body)) return "bench";
      const all = /^(.+?) can use the attacks of all Pok[eé]mon in play as its own\.$/i.exec(body);
      return all && normalize(all[1]) === normalize(card.name) ? "in_play" : null;
    };
    // Current passive permissions/suppression can invalidate route absence.
    // Unused attack prose is not a passive effect, and an unrelated old Item
    // is not assumed to have established an unrecorded persistent exception.
    for (const actor of ["self", "opponent"] as const) {
      const side = state[actor];
      const passiveSources: Array<{ source: CardDefinition[] | null; executor: boolean }> = tops(actor).map((top) => ({ source: candidates(resolve(top)), executor: actor === owner && top.id === card.id }));
      for (const top of tops(actor)) {
        if (top.tool) passiveSources.push({ source: candidates(resolveAttachment(top.tool, actor, top)), executor: false });
        for (const energy of top.energy.filter((name) => /Energy$/i.test(name) && !/^Basic /i.test(name))) passiveSources.push({ source: candidates(resolveAttachment(energy, actor, top)), executor: false });
      }
      for (const pool of side.boardPools ?? []) if (pool.memberIds.length) {
        const conditional = [...(pool.possiblyReturnedCards ?? []), ...(pool.uncertainCards ?? []).flatMap((group) => group.cards)];
        if (conditional.some((component) => component.boardRole !== "evolution" && !/^Basic .+ Energy$/i.test(component.name))) return { status: "unmodelled" };
        for (const component of pool.cards) if (component.boardRole !== "evolution" && !/^Basic .+ Energy$/i.test(component.name)) passiveSources.push({ source: candidates(resolveAttachment(component.name, actor)), executor: false });
      }
      if (state.stadium?.actor === actor) passiveSources.push({ source: candidates(resolve({ ...state.stadium, definitionOwner: actor })), executor: false });
      for (const { source, executor } of passiveSources) {
        if (!source) return { status: "unmodelled" };
        for (const printing of source) {
          if (normalize(printing.category ?? "") !== "pokemon" && (printing.rules === null || printing.attacks.length > 0) || printing.abilities.some((ability) => ability.text === null)) return { status: "unmodelled" };
          for (const text of [...(printing.rules ?? []), ...printing.abilities.map((ability) => ability.text!)]) {
            const namedUseLimit = /You can['’]t use more than \d+ Ability that has "([^"]+)" in its name each turn\./i.exec(text);
            const selfKnockoutOnly = /^Pok[eé]mon in play \(both yours and your opponent['’]s\) lose (?:any Ability that requires the Pok[eé]mon using it to Knock Out itself|all Abilities that require those Pok[eé]mon to be Knocked Out)\.$/i.test(text);
            const irrelevantLimit = namedUseLimit && options.every((candidate) => candidate.abilities.every((ability) => !normalize(ability.name).includes(normalize(namedUseLimit[1])) || !copyLike(ability.text ?? "")));
            if (hasCopyPermission && !irrelevantLimit && !selfKnockoutOnly && /\b(?:lose|has no|have no|ignore all)\b[^.]*\b(?:Abilit(?:y|ies)|Pok[eé]-BODY|Pok[eé]-POWER)\b|\b(?:can't|cannot) use (?!more than)[^.]*\bAbilit(?:y|ies)\b|\bAbilit(?:y|ies)\b[^.]*\b(?:no effect|stop working)\b/i.test(text)) return { status: "unmodelled" };
            if (!copyLike(text)) continue;
            // This owner-only permission cannot lend an attack across sides.
            if (actor !== owner && /^Each of your evolved Pok[eé]mon can use any attack from its previous Evolutions\.(?: \(You still need the necessary Energy to use each attack\.\))?$/i.test(text)) continue;
            // A different Pokémon's self-contained native permission doesn't
            // grant attacks to this executor. Every other permission is held.
            if (normalize(printing.category ?? "") === "pokemon" && !executor && isReplaySelfAttackPermission(text, printing.name)) continue;
            if (!executor || !permission(text)) return { status: "unmodelled" };
          }
        }
      }
    }
    // A recorded permission may persist after its source leaves play. We
    // retain only this source section's executions; unrelated Item effects
    // are not hypothesized to grant attacks merely because prose is missing.
    for (const context of history) {
      const definitions = candidates(resolve(context.card));
      if (!definitions) { if (context.kind !== "trainer") return { status: "unmodelled" }; continue; }
      const texts = definitions.flatMap((printing) => context.kind === "trainer" ? printing.rules ?? []
        : (context.kind === "ability" ? printing.abilities : printing.attacks).filter((effect) => normalize(effect.name) === normalize(context.effect ?? "")).map((effect) => effect.text));
      if (context.kind === "trainer" && definitions.some((printing) => printing.attacks.length > 0)
        || texts.some((text) => text !== null && copyLike(text))
        || context.kind !== "trainer" && (!texts.length || texts.some((text) => text === null))) return { status: "unmodelled" };
    }
    const inventoryComplete = (actor: ReplayActor) => {
      const side = state[actor]; const cards = tops(actor);
      const pools = side.boardPools ?? [];
      if (side.inPlayCount == null || pools.some((pool) => pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length))) return false;
      const objects = [...cards, ...cards.flatMap((top) => top.underlying), ...pools.flatMap((pool) => pool.cards)];
      if (new Set(objects.map((object) => object.id)).size !== objects.length) return false;
      const represented = cards.reduce((total, top) => total + 1 + top.underlying.length + top.energy.length + Number(Boolean(top.tool)), 0)
        + pools.reduce((total, pool) => total + pool.cards.length, 0) + Number(state.stadium?.actor === actor);
      return represented === side.inPlayCount;
    };
    type Route = { kind: "native" } | { kind: "copy"; effect: string; donor: ReplayCard; text: string; definite: boolean };
    const routes: Route[] = [];
    for (const printing of options) {
      if (printing.attacks.some((printed) => normalize(printed.name) === attack)) routes.push({ kind: "native" });
      for (const ability of printing.abilities) {
        if (ability.text === null) return { status: "unmodelled" };
        const scope = permission(ability.text);
        if (!scope) { if (copyLike(ability.text)) return { status: "unmodelled" }; continue; }
        const actors: ReplayActor[] = scope === "bench" ? [owner] : ["self", "opponent"];
        if (!actors.every(inventoryComplete)) return { status: "unmodelled" };
        for (const actor of actors) for (const donor of tops(actor)) {
          if (actor === owner && donor.id === card.id) continue;
          const side = state[actor];
          if (scope === "bench" && side.active?.id === donor.id && !side.activeUncertain && !donor.instanceUncertain) continue;
          const donorOptions = candidates(resolve(donor));
          if (!donorOptions || donorOptions.some((candidate) => candidate.attacks.some((printed) => normalize(printed.name) === attack && printed.text === null))) return { status: "unmodelled" };
          for (const donorPrinting of donorOptions) for (const printed of donorPrinting.attacks.filter((value) => normalize(value.name) === attack)) {
            const definite = scope === "in_play" || side.bench.some((top) => top.id === donor.id) && !side.activeUncertain && !donor.instanceUncertain;
            routes.push({ kind: "copy", effect: ability.name, donor: { ...donor, observedEffects: [...(donor.observedEffects ?? []), attackName] }, text: JSON.stringify(printed), definite });
          }
        }
      }
    }
    if (!routes.length) return { status: "unmodelled" };
    if (routes.every((route) => route.kind === "native")) return { status: "native", observedEffect: attackName };
    if (routes.some((route) => route.kind === "native")) return { status: "unmodelled" };
    const copied = routes.filter((route): route is Extract<Route, { kind: "copy" }> => route.kind === "copy");
    if (!copied.some((route) => route.definite) || copied.some((route) => route.text !== copied[0].text)) return { status: "unmodelled" };
    const effects = new Set(copied.map((route) => normalize(route.effect)));
    return { status: "copied", ...(effects.size === 1 ? { observedEffect: copied[0].effect } : {}), definitionCard: copied.find((route) => route.definite)!.donor };
  };
  /** Final display projection, after every source transition and copy/printing
   * proof has executed. Candidate sets and native effects are never narrowed.
   * Mixed witnessed gameplay families refuse the preference for that owner. */
  const applySeenPrintingPreferences = (program: ReplayProgram, plan: readonly ReplayPrintingProof[]) => {
    for (const proof of plan) {
      if (!proof.effects.length && !(proof.setId && proof.localId)) continue;
      const found = resolve({ name: proof.name, definitionOwner: proof.actor, observedEffects: [...proof.effects], setId: proof.setId, localId: proof.localId });
      const key = ownerName(proof.actor, proof.name);
      if (found?.coverage !== "complete" || !found.candidates.length) { seenFamilies.set(key, null); continue; }
      for (const printing of found.candidates) {
        const signature = familyKey(printing);
        if (!seenFamilies.has(key)) seenFamilies.set(key, signature);
        else if (seenFamilies.get(key) !== signature) seenFamilies.set(key, null);
      }
    }
    if (![...seenFamilies.values()].some(Boolean)) return;
    selectionCache = new WeakMap();
    const eligible = (card: ReplayZoneCard, actor: ReplayActor) => {
      const query = displayCard({ ...card, definitionOwner: actor });
      return hpSelection(query, resolve(query)).preferredFamily === true;
    };
    const decoratePreferred = (card: ReplayZoneCard, actor: ReplayActor, snapshot = false) => {
      if (!eligible(card, actor)) return;
      card.definitionOwner = actor;
      // A snapshot's effective HP already contains the actual modifiers. Only
      // an uncertain printed baseline changes; known setters stay independent.
      if (snapshot && "baseHp" in card) {
        const top = card as ReplayCard;
        const selection = hpSelection(displayCard(top), resolve(displayCard(top)));
        const previousBase = top.baseHp;
        top.baseHp = selection.hp;
        if (printedBaseDependency.get(top) === true && top.maxHp != null && previousBase != null && selection.hp != null) {
          top.maxHp += selection.hp - previousBase; top.hp = top.maxHp;
          top.remainingHp = top.damageKnown === false ? null : Math.max(0, top.maxHp - top.damage);
        }
      }
      decorateCard(card);
    };
    for (const state of program.frames) {
      const changedBoard = (["self", "opponent"] as const).some((actor) =>
        [state[actor].active, ...state[actor].bench, ...(state[actor].unplaced ?? [])].some((card) => card && eligible(card, actor)));
      if (changedBoard) update(state);
      for (const actor of ["self", "opponent"] as const) {
        const side = state[actor];
        const tops = [side.active, ...side.bench, ...(side.unplaced ?? [])].filter((card): card is ReplayCard => card !== null);
        const cards = [...tops, ...tops.flatMap((card) => card.underlying), ...side.knownHand, ...side.discard,
          ...(side.boardPools ?? []).flatMap((pool) => [...pool.cards, ...(pool.memberEvidence ?? []), ...(pool.possiblyReturnedCards ?? []), ...(pool.uncertainCards ?? []).flatMap((group) => group.cards)])];
        cards.forEach((card) => decoratePreferred(card, actor));
      }
    }
    for (const event of program.events) for (const stage of event.transaction?.stages ?? []) {
      if (stage.actor) stage.cards.forEach((card) => decoratePreferred(card, stage.actor!, true));
      for (const [actor, cards] of Object.entries(stage.actorCards ?? {})) cards?.forEach((card) => decoratePreferred(card, actor as ReplayActor, true));
    }
  };
  const applyPrintingProofs = (state: ReplayState, frameIndex: number, plan: readonly ReplayPrintingProof[]) =>
    applyReplayPrintingProofs(plan, state, frameIndex, resolve);
  const applyPrintingProofToCard = (card: ReplayZoneCard, actor: ReplayActor, frameIndex: number, plan: readonly ReplayPrintingProof[]) =>
    applyReplayPrintingProofToCard(plan, card, actor, frameIndex, resolve);
  return { resolve, update, abilityTexts, effectConstraints, trainerDisposition, attackPrintingEvidence, hasAttachmentHpModifier, decorateCard, decorateState, applyPrintingProofs, applyPrintingProofToCard, applySeenPrintingPreferences, copySnapshotHpProvenance, collectResolutions: () => cardResolutions };
}

export function replayCardDefinitionEvidence(card: ReplayCard, evidence: CardDefinitionEvidenceByName | undefined) {
  return createReplayHpContext(evidence).resolve(card);
}
