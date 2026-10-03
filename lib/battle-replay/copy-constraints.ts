import type { ReplayActor, ReplayCard } from "./types";

/** Source operations retain copy facts before presentation pooling discards
 * their correlation. This ledger never contains hidden hand/deck cards. */
export type CopyFact = { card: ReplayCard; position: "active" | "bench"; entered?: number; evolved?: number };
export type CopyStep = {
  key: string; event: number; section: number; actor: ReplayActor;
  kind: "create" | "evolve" | "attach" | "promote" | "retreat" | "ability" | "damage" | "counters" | "remove_energy" | "ko" | "heal" | "barrier" | "witness";
  name: string; position?: "active" | "bench"; newName?: string; cards?: CopyFact[];
  energy?: string; amount?: number; once?: boolean; timing?: boolean;
  requiredEnergy?: string;
  tool?: string;
  /** Source/destination selections belonging to the same verified activation. */
  referenceKey?: string; distinctFromKey?: string;
  targetId?: string;
  effectAllowed?: (card: ReplayCard) => boolean;
  belowTop?: string[]; belowTopCount?: number; lethal?: (card: ReplayCard, copies: readonly CopyFact[]) => boolean | undefined;
  /** Exact native cost only after the compiler's complete modifier guard. */
  cost?: readonly string[];
  effect?: string;
};
export type ReplayCopyProofs = {
  bindings: ReadonlyMap<string, string>;
  relations: ReadonlyMap<string, string>;
  used: ReadonlyMap<number, readonly { actor: ReplayActor; id: string; name: string; effects: readonly string[] }[]>;
  barriers: readonly { frameIndex: number; actor: ReplayActor; cardId?: string }[];
  peakAlternatives: number; boundedOut: boolean;
  projection: ReadonlyMap<number, ReadonlyMap<ReplayActor, CopyProjection>>;
};
export type CopyProjection = { cards: CopyFact[]; moves: Array<{ sourceKey: string; kind: "damage" | "counters" | "attach" | "promote"; cardId: string; amount?: number }> };
type Witness = { previous?: Witness; event: number; cards: CopyFact[]; move?: CopyProjection["moves"][number] };
type World = { copies: CopyFact[]; choices: Map<string, Set<string>>; references: Map<string, string>; witness?: Witness; projectionValid?: boolean };
const stateKey = (world: World, factual: boolean) => JSON.stringify([world.copies.map((copy) => [copy.card.id, copy.card.name, copy.position, copy.entered, copy.evolved,
  copy.card.damage, copy.card.damageKnown, copy.card.abilityUsed, [...copy.card.energy].sort(), copy.card.underlying.map((layer) => [layer.id, layer.name, layer.setId, layer.localId]), copy.card.tool,
  copy.card.setId, copy.card.localId, [...(copy.card.observedEffects ?? [])].sort(), copy.card.conditions,
  ...(factual ? [] : [copy.card.instanceUncertain, copy.card.hpModifierUncertain, copy.card.hpModifierBasis])]).sort(), ...(factual ? [] : [[...world.references]])]);
const components = (card: ReplayCard) => [...card.underlying.map((layer) => layer.name), ...card.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(card.tool ? [card.tool] : [])];
const contains = (available: string[], required: readonly string[]) => {
  const remaining = [...available];
  return required.every((value) => { const index = remaining.indexOf(value); if (index < 0) return false; remaining.splice(index, 1); return true; });
};

/** Finite symbolic execution: intersections establish facts; a separate whole
 * witness supplies a plausible display allocation. At most 128 alternatives
 * exist per player/source segment. Unsupported facts and failed bounds refuse. */
export function solveReplayCopyConstraints(steps: readonly CopyStep[], mode: "facts" | "display" | "combined" = "combined"): ReplayCopyProofs {
  const bindings = new Map<string, string>();
  const relations = new Map<string, string>();
  const used = new Map<number, Array<{ actor: ReplayActor; id: string; name: string; effects: readonly string[] }>>();
  const barriers: Array<{ frameIndex: number; actor: ReplayActor; cardId?: string }> = [];
  const projection = new Map<number, Map<ReplayActor, CopyProjection>>();
  const referencedKeys = new Set(steps.flatMap((step) => [step.referenceKey, step.distinctFromKey].filter((key): key is string => Boolean(key))));
  const lastFrame = Math.max(0, ...steps.map((step) => step.event + 1));
  let peakAlternatives = 1; let boundedOut = false;
  for (const actor of ["self", "opponent"] as const) {
    let worlds: World[] = [{ copies: [], choices: new Map(), references: new Map() }];
    let section = -1;
    let checkpoints: Array<{ event: number; worlds: World[] }> = [];
    const project = () => {
      // Equal-state merging unions proof choices, but retains ONE complete
      // concrete predecessor chain. Never splice independently chosen unions.
      const path: Witness[] = []; let node = worlds.find((world) => world.projectionValid !== false)?.witness;
      while (node) { path.push(node); node = node.previous; }
      path.reverse();
      const movesByEvent = new Map<number, CopyProjection["moves"]>();
      for (const entry of path) if (entry.move) movesByEvent.set(entry.event, [...(movesByEvent.get(entry.event) ?? []), entry.move]);
      for (let index = 0; index < path.length; index++) {
        const checkpoint = path[index]; const from = checkpoint.event + 1;
        const to = (path[index + 1]?.event ?? lastFrame) + 1;
        for (let frame = from; frame < to; frame++) {
          const cards = checkpoint.cards.filter((copy) => !copy.card.instanceUncertain);
          if (!cards.length) continue;
          const actors = projection.get(frame) ?? new Map<ReplayActor, CopyProjection>();
          const old = actors.get(actor) ?? { cards: [], moves: [] };
          const replacing = new Set(cards.map((copy) => copy.card.id));
          const moves = frame === from ? (movesByEvent.get(checkpoint.event) ?? []).filter((move) => replacing.has(move.cardId)) : [];
          actors.set(actor, { cards: [...old.cards.filter((copy) => !replacing.has(copy.card.id)), ...cards], moves: [...old.moves.filter((move) => !replacing.has(move.cardId)), ...moves] });
          projection.set(frame, actors);
        }
      }
    };
    const finish = () => {
      if (mode === "display") return;
      if (!worlds.length) return;
      const keys = new Set(worlds.flatMap((world) => [...world.choices.keys()]));
      for (const key of keys) {
        const choices = new Set(worlds.flatMap((world) => [...(world.choices.get(key) ?? [])]));
        if (choices.size === 1 && worlds.every((world) => world.choices.has(key))) bindings.set(key, [...choices][0]);
        else {
          const event = Number(JSON.parse(key)[0]);
          // An attachment carrier can be proven up to a global permutation of
          // originally interchangeable copies. Preserve that relation instead
          // of falsely declaring one original physical ID to be evidenced.
          const reference = [...keys].find((earlier) => Number(JSON.parse(earlier)[0]) < event && worlds.every((world) => {
            const previous = world.choices.get(earlier); const current = world.choices.get(key);
            return previous?.size === 1 && current?.size === 1 && [...previous][0] === [...current][0];
          }));
          if (reference) relations.set(key, reference);
        }
      }
      // Collective once-per-copy use is knowable at the completion checkpoint,
      // although the order of the individual uses can remain unidentified.
      for (const checkpoint of checkpoints) {
        const survivors = checkpoint.worlds.filter((past) => worlds.some((current) => [...past.choices].every(([key, ids]) => [...ids].some((id) => current.choices.get(key)?.has(id)))));
        if (!survivors.length) continue;
        const facts = survivors[0].copies.filter((copy) => copy.card.abilityUsed && survivors.every((world) => world.copies.some((other) => other.card.id === copy.card.id && other.card.name === copy.card.name && other.card.abilityUsed)));
        if (facts.length) {
          const entries = [...(used.get(checkpoint.event) ?? []), ...facts.map((copy) => ({ actor, id: copy.card.id, name: copy.card.name, effects: (copy.card.observedEffects ?? []).filter((effect) => survivors.every((world) => world.copies.some((other) => other.card.id === copy.card.id && other.card.observedEffects?.includes(effect)))) }))];
          used.set(checkpoint.event, [...new Map(entries.map((entry) => [`${entry.actor}:${entry.id}:${entry.name}`, entry])).values()]);
        }
      }
    };
    for (const step of steps.filter((entry) => entry.actor === actor)) {
      if (step.section !== section) { worlds.forEach((world) => { world.copies = world.copies.map((copy) => ({ ...copy, card: { ...copy.card, abilityUsed: false } })); }); section = step.section; }
      if (step.kind === "barrier") {
        finish();
        // Earlier proofs cannot cross a source operation whose identity effect
        // is unmodelled. Restore only the explicitly retained known snapshot.
        const affected = new Set(worlds.flatMap((world) => world.copies.filter((copy) => step.name === "*" || copy.card.name === step.name).map((copy) => copy.card.id)));
        if (step.name === "*") barriers.push({ frameIndex: step.event + 1, actor });
        else affected.forEach((cardId) => barriers.push({ frameIndex: step.event + 1, actor, cardId }));
        worlds.forEach((world) => {
          world.copies = [...world.copies.filter((copy) => !affected.has(copy.card.id)), ...structuredClone((step.cards ?? []).filter((copy) => affected.has(copy.card.id) || copy.card.name === step.name))];
          for (const [key, ids] of world.choices) if ([...ids].some((id) => affected.has(id))) world.choices.delete(key);
          for (const [key, id] of world.references) if (affected.has(id)) world.references.delete(key);
          if (mode !== "facts") world.witness = { previous: world.witness, event: step.event, cards: world.copies };
        });
        checkpoints = checkpoints.map((checkpoint) => ({ ...checkpoint, worlds: checkpoint.worlds.map((world) => ({ ...world, copies: world.copies.filter((copy) => !affected.has(copy.card.id)) })) }));
        continue;
      }
      if (step.kind === "create") {
        worlds.forEach((world) => { world.copies = [...world.copies]; for (const card of step.cards ?? []) if (!world.copies.some((copy) => copy.card.id === card.card.id)) world.copies.push(structuredClone(card)); if (mode !== "facts") world.witness = { previous: world.witness, event: step.event, cards: world.copies }; });
        continue;
      }
      const next: World[] = [];
      worldLoop: for (const world of worlds) {
        // A barrier snapshot can retain an unidentified/unplaced presentation
        // copy. It is not a known symbolic allocation and cannot become proof
        // merely because its displayed name is the last remaining candidate.
        let candidates = world.copies.filter((copy) => !copy.card.instanceUncertain && copy.card.name === step.name && (!step.position || copy.position === step.position));
        if (step.targetId) candidates = candidates.filter((copy) => copy.card.id === step.targetId);
        const nonlethal = new Set<string>();
        if (step.referenceKey) candidates = candidates.filter((copy) => copy.card.id === world.references.get(step.referenceKey!));
        if (step.distinctFromKey) candidates = candidates.filter((copy) => world.references.has(step.distinctFromKey!) && copy.card.id !== world.references.get(step.distinctFromKey!));
        if (step.kind === "attach" && step.tool) candidates = candidates.filter((copy) => !copy.card.tool);
        if (step.effectAllowed) candidates = candidates.filter((copy) => step.effectAllowed!(copy.card));
        if (step.kind === "ability" && step.once) candidates = candidates.filter((copy) => !copy.card.abilityUsed);
        if (step.requiredEnergy) candidates = candidates.filter((copy) => copy.card.instanceUncertain || copy.card.energy.some((energy) => energy === step.requiredEnergy || energy === `Basic ${step.requiredEnergy} Energy` || /Energy$/i.test(energy) && !/^Basic /i.test(energy)));
        if (step.kind === "evolve" && step.timing) candidates = candidates.filter((copy) => copy.entered !== step.section && copy.evolved !== step.section);
        if (step.kind === "counters") candidates = candidates.filter((copy) => copy.card.damageKnown !== false && copy.card.damage >= (step.amount ?? 0));
        if (step.kind === "ko") {
          const verdicts = candidates.map((copy) => step.lethal?.(copy.card, world.copies));
          candidates.forEach((copy, index) => { if (verdicts[index] === false) nonlethal.add(copy.card.id); });
          const lethal = candidates.filter((_, index) => verdicts[index] === true);
          if (verdicts.every((value) => value !== undefined) && lethal.length === 1) candidates = lethal;
          candidates = candidates.filter((copy) => contains(components(copy.card), step.belowTop ?? []) && (step.belowTopCount === undefined || components(copy.card).length === step.belowTopCount));
        }
        if (step.kind === "remove_energy") candidates = candidates.filter((copy) => copy.card.energy.includes(step.energy ?? ""));
        if (step.cost?.length) candidates = candidates.filter((copy) => contains(copy.card.energy, step.cost!.filter((type) => type !== "Colorless")) && copy.card.energy.length >= step.cost!.length);
        for (const candidate of candidates) {
          const branch: World = { copies: structuredClone(world.copies), choices: mode === "display" ? new Map() : new Map([...world.choices].map(([key, values]) => [key, new Set(values)])), references: new Map(world.references), witness: world.witness, projectionValid: world.projectionValid !== false && !nonlethal.has(candidate.card.id) };
          const copy = branch.copies.find((entry) => entry.card.id === candidate.card.id)!;
          if (mode !== "display") branch.choices.set(step.key, new Set([copy.card.id]));
          if (referencedKeys.has(step.key)) branch.references.set(step.key, copy.card.id);
          if (step.kind === "evolve") { copy.card.underlying.push({ id: `${step.key}:layer`, name: copy.card.name, imageUrl: "" }); copy.card.name = step.newName!; copy.card.observedEffects = []; copy.card.abilityUsed = false; copy.card.conditions = []; delete copy.card.setId; delete copy.card.localId; delete copy.card.definitionKey; delete copy.card.baseHp; delete copy.card.maxHp; delete copy.card.hpBasis; copy.card.hp = null; copy.evolved = step.section; }
          if (step.kind === "attach") { if (step.tool) copy.card.tool = step.tool; else copy.card.energy.push(step.energy!); }
          if (step.kind === "promote") { branch.copies.filter((other) => other.position === "active").forEach((other) => { other.position = "bench"; other.card.conditions = []; }); copy.position = "active"; }
          if (step.kind === "retreat") { copy.position = "bench"; copy.card.conditions = []; }
          if (step.kind === "ability") { copy.card.abilityUsed = true; if (step.effect) copy.card.observedEffects = [...new Set([...(copy.card.observedEffects ?? []), step.effect])]; }
          if (step.kind === "witness" && step.effect) copy.card.observedEffects = [...new Set([...(copy.card.observedEffects ?? []), step.effect])];
          if (step.kind === "damage") copy.card.damage += step.amount!;
          if (step.kind === "counters") copy.card.damage -= step.amount!;
          if (step.kind === "heal") copy.card.damage = Math.max(0, copy.card.damage - step.amount!);
          if (step.kind === "remove_energy") copy.card.energy.splice(copy.card.energy.indexOf(step.energy!), 1);
          if (step.kind === "ko") branch.copies = branch.copies.filter((other) => other.card.id !== copy.card.id);
          if (mode !== "facts") branch.witness = { previous: world.witness, event: step.event, cards: branch.copies,
            ...(["damage", "counters", "attach", "promote"].includes(step.kind) ? { move: { sourceKey: step.key, kind: step.kind as CopyProjection["moves"][number]["kind"], cardId: copy.card.id, ...(step.amount !== undefined ? { amount: step.amount } : {}) } } : {}) };
          next.push(branch);
          if (next.length > 128) break worldLoop;
        }
      }
      if (!next.length || next.length > 128) {
        boundedOut ||= next.length > 128;
        barriers.push({ frameIndex: step.event + 1, actor });
        worlds = [{ copies: structuredClone(step.cards ?? []), choices: new Map(), references: new Map() }]; checkpoints = [];
        continue;
      }
      const merged = new Map<string, World>();
      for (const world of next) {
        const key = stateKey(world, mode === "facts"); const existing = merged.get(key);
        if (!existing) merged.set(key, world);
        else {
          for (const [choice, values] of world.choices) existing.choices.set(choice, new Set([...(existing.choices.get(choice) ?? []), ...values]));
          if (existing.projectionValid === false && world.projectionValid !== false) { existing.witness = world.witness; existing.projectionValid = true; }
        }
      }
      worlds = [...merged.values()]; peakAlternatives = Math.max(peakAlternatives, worlds.length);
      if (mode !== "display" && step.kind === "ability" && step.once) checkpoints.push({ event: step.event, worlds: worlds.map((world) => ({ copies: structuredClone(world.copies), choices: new Map([...world.choices].map(([key, ids]) => [key, new Set(ids)])), references: new Map(world.references) })) });
    }
    finish();
    if (mode !== "facts") project();
  }
  return { bindings, relations, used, barriers, peakAlternatives, boundedOut, projection };
}

export const replayCopyKey = (event: number, actor: ReplayActor, line: string, name: string, position?: string, ordinal = -1, role?: "donor" | "recipient") => JSON.stringify([event, actor, ordinal, line, name, position ?? null, ...(role ? [role] : [])]);
