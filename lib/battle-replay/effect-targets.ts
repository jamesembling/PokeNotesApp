import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinition, CardDefinitionEvidence } from "@/lib/card-definition-catalog/types";
import type { ReplayEffectKind } from "./types";

export type ReplayEffectOperation = "put_counters" | "move_counters" | "return_energy" | "stadium_activation" | "devolve" | "attach_energy" | "move_energy" | "heal";
export type ReplayEffectTarget = {
  /** Relative to the controller of the effect, never the log detail's possessive. */
  owner: "effect_actor" | "opponent" | "either" | "trigger";
  zone: "board" | "active" | "bench";
  subject?: "source" | "trigger" | "healed";
  namePrefix?: string;
};
type CounterQuantity = { kind: "exact" | "at_most" | "all" | "any"; value?: number; perTarget?: true };
type BenchTrigger = { kind: "bench"; basic: true; excludedType?: string; duringOwnerTurn: true };
type ZoneMovement = { origin: "hand" | "deck"; destination: "hand" | "deck" | "discard"; quantity: number };
export type ReplayEffectConstraint =
  | { status: "known"; operation: "put_counters"; target: ReplayEffectTarget; quantity: CounterQuantity; trigger?: BenchTrigger }
  | { status: "known"; operation: "move_counters"; from: ReplayEffectTarget; to: ReplayEffectTarget; quantity: CounterQuantity; distinctTargets: boolean }
  | { status: "known"; operation: "return_energy"; target: ReplayEffectTarget; origin: "board"; destination: "hand"; all: true; requiresRecordedHeal: boolean }
  | { status: "known"; operation: "stadium_activation"; owner: "effect_actor"; movements: ZoneMovement[]; oncePerTurn: true; switch?: never; search?: { category: "Pokemon"; namePrefix: string } }
  | { status: "known"; operation: "stadium_activation"; owner: "effect_actor"; movements: []; oncePerTurn: true; switch: { from: ReplayEffectTarget; to: ReplayEffectTarget; pokemonType: string }; search?: never }
  | { status: "known"; operation: "devolve"; target: ReplayEffectTarget; pokemonType?: string; origin: "board"; destination: "hand"; layers: "evolution_suffix"; quantity: "any" }
  | { status: "known"; operation: "attach_energy"; target: ReplayEffectTarget; origin: "deck"; destination: "board"; basicEnergyType: string; quantity: CounterQuantity }
  | { status: "known"; operation: "move_energy"; from: ReplayEffectTarget; to: ReplayEffectTarget; origin: "board"; destination: "board"; basicOnly: true; quantity: CounterQuantity; distinctTargets: true }
  | { status: "known"; operation: "heal"; target: ReplayEffectTarget; amount: number; afterAttachment?: { basicEnergyType: string; origin: "hand" } }
  | { status: "neutral" | "unmodelled" | "unavailable"; operation: ReplayEffectOperation };

const cleanText = (text: string) => text.normalize("NFC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const unknown = (operation: ReplayEffectOperation): ReplayEffectConstraint => ({ status: "unmodelled", operation });
const pokemonTypes: Record<string, string> = { D: "Darkness", F: "Fighting", G: "Grass", L: "Lightning", M: "Metal", P: "Psychic", R: "Fire", W: "Water", Y: "Fairy", N: "Dragon", C: "Colorless" };

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
  if (operation === "heal") {
    const attachment = /^Once during your turn, you may attach a Basic \{([A-Z])\} Energy card from your hand to 1 of your Pok[eé]mon\. If you attached Energy to a Pok[eé]mon in this way, heal (\d+) damage from that Pok[eé]mon\.$/i.exec(text);
    const fixed = /^Heal (\d+) damage from (.+?)\.$/i.exec(text);
    const amount = Number(attachment?.[2] ?? fixed?.[1]);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 6000) return unknown(operation);
    if (attachment && pokemonTypes[attachment[1].toUpperCase()]) return { status: "known", operation,
      target: { owner: "effect_actor", zone: "board" }, amount,
      afterAttachment: { basicEnergyType: pokemonTypes[attachment[1].toUpperCase()], origin: "hand" },
    };
    const selected = fixed && target(fixed[2]);
    return selected ? { status: "known", operation, target: selected, amount } : unknown(operation);
  }
  if (operation === "move_energy") {
    return basicEnergyMovement(text) ? { status: "known", operation, origin: "board", destination: "board", basicOnly: true, quantity: { kind: "exact", value: 1 }, distinctTargets: true,
      from: { owner: "effect_actor", zone: "board" }, to: { owner: "effect_actor", zone: "board" },
    } : unknown(operation);
  }
  if (operation === "attach_energy") {
    const match = /^(?:When you play this Pok[eé]mon from your hand to evolve 1 of your Pok[eé]mon during your turn, )?you may search your deck for (up to \d+|\d+) Basic \{([A-Z])\} Energy cards and attach them to your (?:([^.]+'s) )?Pok[eé]mon in any way you like\. Then, shuffle your deck\.$/i.exec(text);
    const amount = match ? quantity(match[1]) : null;
    const energyType = match && pokemonTypes[match[2].toUpperCase()];
    return match && amount && energyType ? { status: "known", operation, origin: "deck", destination: "board", basicEnergyType: energyType, quantity: amount,
      target: { owner: "effect_actor", zone: "board", ...(match[3] ? { namePrefix: match[3] } : {}) },
    } : unknown(operation);
  }
  if (operation === "stadium_activation") {
    const searched = /^Once during each player's turn, that player may search their deck for a ([^.]+?'s) Pok[eé]mon, reveal it, and put it into their hand\. Then, that player shuffles their deck\.$/i.exec(text);
    if (searched) return { status: "known", operation, owner: "effect_actor", oncePerTurn: true,
      movements: [{ origin: "deck", destination: "hand", quantity: 1 }], search: { category: "Pokemon", namePrefix: searched[1] },
    };
    const switched = /^Once during each player's turn, that player may switch their Active \{([A-Z])\} Pok[eé]mon with 1 of their Benched \{\1\} Pok[eé]mon\.$/i.exec(text);
    if (switched && pokemonTypes[switched[1].toUpperCase()]) return { status: "known", operation, owner: "effect_actor", oncePerTurn: true, movements: [], switch: {
      from: { owner: "effect_actor", zone: "active" }, to: { owner: "effect_actor", zone: "bench" }, pokemonType: pokemonTypes[switched[1].toUpperCase()],
    } };
    const discardDraw = /^Once during each player's turn, that player may discard (a|\d+) cards? from their hand in order to draw (a|\d+) cards?\.$/i.exec(text);
    if (discardDraw) {
      const discarded = quantity(discardDraw[1]);
      const drawn = quantity(discardDraw[2]);
      if (discarded?.value && drawn?.value) return { status: "known", operation, owner: "effect_actor", oncePerTurn: true, movements: [
        { origin: "hand", destination: "discard", quantity: discarded.value },
        { origin: "deck", destination: "hand", quantity: drawn.value },
      ] };
    }
    const handDeck = /^Once during each player's turn, that player may put (a|\d+) cards? from their hand on top of their deck\.$/i.exec(text);
    const moved = handDeck ? quantity(handDeck[1]) : null;
    return moved?.value ? { status: "known", operation, owner: "effect_actor", oncePerTurn: true, movements: [
      { origin: "hand", destination: "deck", quantity: moved.value },
    ] } : unknown(operation);
  }
  if (operation === "devolve") {
    const match = /^Devolve 1 of your evolved(?: \{([A-Z])\})? Pok[eé]mon by putting any number of Evolution cards on it into your hand\. \(That Pok[eé]mon can't evolve this turn\.\)$/i.exec(text);
    if (!match || match[1] && !pokemonTypes[match[1].toUpperCase()]) return unknown(operation);
    return { status: "known", operation, target: { owner: "effect_actor", zone: "board" }, origin: "board", destination: "hand", layers: "evolution_suffix", quantity: "any", ...(match[1] ? { pokemonType: pokemonTypes[match[1].toUpperCase()] } : {}) };
  }
  if (operation === "put_counters") {
    const clauses = [...text.matchAll(/\b(?:put|place) (up to \d+|\d+|a|all) damage counters? on (.+?)(?=\.|$)/gi)];
    if (!clauses.length) return /damage counters?/i.test(text) ? unknown(operation) : { status: "neutral", operation };
    if (clauses.length !== 1 || /\bif (?:heads|tails)\b|\botherwise\b/i.test(text)) return unknown(operation);
    const clause = clauses[0];
    const multiplier = / for each (?:card in your hand|\{[DFGLMPRWYNC]\} Energy attached to (?:this Pok[eé]mon|all of your Pok[eé]mon))$/i.exec(clause[2]);
    // One understood multiplier changes quantity only; the recorded number
    // supplies that quantity. Branches and unknown selectors remain unmodelled.
    if (/\bfor each\b/i.test(text) && (!multiplier || text.slice(0, clause.index).trim() !== "" || text.slice(clause.index! + clause[0].length).replace(/^\./, "").trim() !== "")) return unknown(operation);
    const suffix = (multiplier ? clause[2].slice(0, multiplier.index) : clause[2]).replace(/ in any way you like$/i, "");
    const amount = multiplier ? { kind: "any" as const } : quantity(clause[1]);
    if (!amount) return unknown(operation);
    if (/^each /i.test(suffix)) amount.perTarget = true;
    const selected = target(suffix);
    if (selected) return { status: "known", operation, target: selected, quantity: amount };
    if (/^that Pok[eé]mon$/i.test(suffix)) {
      const trigger = /^Whenever any player puts a Basic(?: non-\{([A-Z])\})? Pok[eé]mon onto their Bench during their turn, (?:put|place) \d+ damage counters? on that Pok[eé]mon\.$/i.exec(text);
      if (trigger && (!trigger[1] || pokemonTypes[trigger[1].toUpperCase()])) return {
        status: "known", operation, target: { owner: "trigger", zone: "bench", subject: "trigger" }, quantity: amount,
        trigger: { kind: "bench", basic: true, duringOwnerTurn: true, ...(trigger[1] ? { excludedType: pokemonTypes[trigger[1].toUpperCase()] } : {}) },
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
    if (operation === "stadium_activation" && (card.category !== "Trainer" || normalizeText(card.trainerType ?? "") !== "stadium")) return unknown(operation);
    const text = effectText(card, effectName, kind);
    return text === null ? { status: "unavailable" as const, operation } : fromText(text, operation);
  });
  if (plans.some((plan) => plan.status === "unavailable")) return { status: "unavailable", operation };
  return plans.every((plan) => JSON.stringify(plan) === JSON.stringify(plans[0])) ? plans[0] : unknown(operation);
}

export type ReplayTrainerDisposition = { status: "known"; destination: "discard" | "board" } | { status: "unavailable" | "unmodelled" };

function basicEnergyMovement(text: string): boolean {
  return /^Move a Basic Energy(?: card)? (?:from |attached (?:to )?)1 of your Pok[eé]mon to another of your Pok[eé]mon\.$/i.test(text);
}

/** A complete instantaneous rule can identify a historical functional reprint
 * even when the provider omitted its modern Trainer subtype. */
function instantaneousTrainerRule(card: CardDefinition): string | null {
  if (card.rules === null) return null;
  const text = cleanText(card.rules.join(" "));
  if (basicEnergyMovement(text)) return "move_basic_energy_own_board";
  return /^Switch (?:1 of )?your (?:own )?Active Pok[eé]mon with 1 of your (?:own )?Benched Pok[eé]mon\.$/i.test(text)
    || /^Switch 1 of your (?:own )?Benched Pok[eé]mon with your Active Pok[eé]mon\.$/i.test(text)
    ? "switch_own_active_bench" : null;
}

export function resolveReplayTrainerDisposition(evidence: CardDefinitionEvidence | undefined): ReplayTrainerDisposition {
  if (!evidence || evidence.coverage !== "complete" || !evidence.candidates.length) return { status: "unavailable" };
  const verifiedInstantRules = new Set(evidence.candidates.filter((card) => card.category === "Trainer" && normalizeText(card.trainerType ?? "") === "item").map(instantaneousTrainerRule).filter((rule) => rule !== null));
  const destinations = evidence.candidates.map((card) => {
    if (card.category !== "Trainer") return null;
    const kind = normalizeText(card.trainerType ?? "");
    if (kind === "item" || kind === "supporter") return "discard";
    if (kind === "tool" || kind === "pokemon tool" || kind === "stadium") return "board";
    const rule = instantaneousTrainerRule(card);
    return !kind && rule && verifiedInstantRules.has(rule) ? "discard" : null;
  });
  const destination = destinations[0];
  return destination && destinations.every((value) => value === destination) ? { status: "known", destination } : { status: "unmodelled" };
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
