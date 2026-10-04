import type { ReplayActor, ReplayBoardPool, ReplayCard, ReplaySide } from "./types";

/** Source operations retain copy facts before presentation pooling discards
 * their correlation. This ledger never contains hidden hand/deck cards. */
export type CopyFact = { card: ReplayCard; position: "active" | "bench"; positionKnown?: boolean; componentsOpen?: boolean; entered?: number; evolved?: number };

/** Reconcile a symbolic HP board with guaranteed public attachment inventory.
 * Unallocated Basic Energy retains its possible holders; this establishes no
 * individual attachment or effective HP. Other missing components refuse. */
export function resolveReplayKnockoutHpInventory(side: ReplaySide, copies: readonly CopyFact[], ownsStadium: boolean): ReplayBoardPool[] | undefined {
  const pools = side.boardPools ?? [];
  if (pools.some((pool) => pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length))) return undefined;
  const names = (card: ReplayCard) => [...card.underlying.map((layer) => layer.name),
    ...card.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(card.tool ? [card.tool] : [])];
  const additional = copies.flatMap((copy) => names(copy.card));
  const local = [side.active, ...side.bench, ...(side.unplaced ?? [])].filter((card): card is ReplayCard => card !== null);
  for (const name of local.flatMap(names)) {
    const index = additional.indexOf(name); if (index < 0) return undefined;
    additional.splice(index, 1);
  }
  const ids = new Set(copies.map((copy) => copy.card.id));
  const retained: ReplayBoardPool[] = [];
  for (const pool of pools) {
    if (pool.cards.length && (!pool.memberIds.length || pool.memberIds.some((id) => !ids.has(id)))) return undefined;
    const cards = pool.cards.filter((component) => {
      const index = additional.indexOf(component.name);
      if (index < 0) return true;
      additional.splice(index, 1); return false;
    });
    if (cards.some((component) => !/^Basic .+ Energy$/i.test(component.name) || component.boardRole !== "energy")) return undefined;
    if (cards.length) retained.push({ ...structuredClone(pool), cards: structuredClone(cards) });
  }
  const represented = copies.reduce((sum, copy) => sum + 1 + names(copy.card).length, Number(ownsStadium));
  return additional.length || side.inPlayCount !== represented + retained.reduce((sum, pool) => sum + pool.cards.length, 0) ? undefined : retained;
}
export type CopyStep = {
  key: string; event: number; section: number; actor: ReplayActor;
  kind: "create" | "evolve" | "attach" | "promote" | "retreat" | "ability" | "damage" | "counters" | "remove_energy" | "ko" | "heal" | "barrier" | "witness" | "checkpoint";
  name: string; position?: "active" | "bench"; newName?: string; cards?: CopyFact[];
  energy?: string; amount?: number; once?: boolean; timing?: boolean;
  requiredEnergy?: string;
  /** Producer-validated complete native unconditional once-copy cohort. */
  cohortMembers?: readonly string[];
  tool?: string;
  /** Source/destination selections belonging to the same verified activation. */
  referenceKey?: string; distinctFromKey?: string;
  targetId?: string;
  /** Connected source domains affected by a local unsupported mutation. */
  barrierNames?: readonly string[];
  /** Display continuity preference only; later constraints retain priority. */
  preferredId?: string;
  effectAllowed?: (card: ReplayCard) => boolean;
  belowTop?: string[]; belowTopCount?: number; lethal?: (card: ReplayCard, copies: readonly CopyFact[]) => boolean | undefined;
  /** Exact native cost only after the compiler's complete modifier guard. */
  cost?: readonly string[];
  effect?: string;
  /** Display-only convention for a completed adjacent attack knockout batch. */
  attackKoBatch?: { id: string; index: number; last: boolean };
};
export type ReplayAbilityCohortProof = { actor: ReplayActor; name: string; effect: string; section: number; memberIds: readonly string[]; fromEvent: number; untilEvent: number };

/** Cardinality of legal native once-copy activations entails a universal
 * marker without enumerating an order or choosing original physical IDs. */
function collectAbilityCohorts(steps: readonly CopyStep[]): ReplayAbilityCohortProof[] {
  const result: ReplayAbilityCohortProof[] = [];
  for (const actor of ["self", "opponent"] as const) {
    const scopes = new Map<string, { section: number; members: string[]; uses: number; proof?: ReplayAbilityCohortProof }>();
    const activations = new Map<string, number>();
    const blocked = new Map<string, number>();
    let section = -1;
    const close = (name: string, event: number, uncertainWindow = true) => {
      const names = name === "*" ? new Set([...activations.keys(), ...[...scopes.keys()].map((key) => key.split("\u0000")[0])]) : new Set([name]);
      for (const affected of names) {
        if (uncertainWindow && activations.has(affected)) blocked.set(affected, event);
        for (const [key, scope] of scopes) if (key.startsWith(`${affected}\u0000`)) {
          if (scope.proof) scope.proof.untilEvent = Math.min(scope.proof.untilEvent, event);
          scopes.delete(key);
        }
      }
    };
    for (const step of steps.filter((entry) => entry.actor === actor)) {
      if (step.section !== section) { close("*", step.event, false); scopes.clear(); activations.clear(); blocked.clear(); section = step.section; }
      if (step.kind !== "create") for (const [key, scope] of scopes) {
        const name = key.split("\u0000")[0];
        const ids = (step.cards ?? []).filter((copy) => copy.card.name === name).map((copy) => copy.card.id).sort();
        if (JSON.stringify(ids) !== JSON.stringify(scope.members)) close(name, step.event);
      }
      if (step.kind === "create") for (const copy of step.cards ?? []) close(copy.card.name, step.event);
      if (step.kind === "barrier" || step.kind === "evolve" || step.kind === "ko") {
        close(step.name, step.event);
        if (step.newName) close(step.newName, step.event);
      }
      if (step.kind !== "ability" || !step.once || !step.effect) continue;
      if (!step.cohortMembers?.length) { close(step.name, step.event); blocked.set(step.name, step.event); activations.set(step.name, step.event); continue; }
      const key = `${step.name}\u0000${step.effect}`;
      const members = [...step.cohortMembers].sort();
      const copies = (step.cards ?? []).filter((copy) => copy.card.name === step.name);
      const represented = copies.map((copy) => copy.card.id).sort();
      if (new Set(members).size !== members.length || JSON.stringify(members) !== JSON.stringify(represented)) { close(step.name, step.event); continue; }
      const boundary = blocked.get(step.name);
      if (boundary !== undefined) {
        // A truly new source-born top/entry can establish a new legal window;
        // an erased namesake or a mere scope reset cannot erase earlier uses.
        const allNew = copies.every((copy) => {
          const birth = copy.card.physicalCardId && /^action-(\d+)-physical-\d+$/.exec(copy.card.physicalCardId);
          return Boolean(birth && Number(birth[1]) > boundary);
        });
        if (!allNew) { activations.set(step.name, step.event); continue; }
        blocked.delete(step.name); activations.delete(step.name);
      }
      let scope = scopes.get(key);
      if (!scope) { scope = { section: step.section, members, uses: 0 }; scopes.set(key, scope); }
      scope.uses++; activations.set(step.name, step.event);
      if (scope.uses === members.length) {
        scope.proof = { actor, name: step.name, effect: step.effect, section: step.section, memberIds: members, fromEvent: step.event, untilEvent: Number.MAX_SAFE_INTEGER };
        result.push(scope.proof);
      } else if (scope.uses > members.length) close(step.name, step.event);
    }
  }
  return result;
}

export type ReplayCopyProofs = {
  cohorts: readonly ReplayAbilityCohortProof[];
  bindings: ReadonlyMap<string, string>;
  relations: ReadonlyMap<string, string>;
  used: ReadonlyMap<number, readonly { actor: ReplayActor; id: string; name: string; effects: readonly string[] }[]>;
  barriers: readonly { frameIndex: number; actor: ReplayActor; cardId?: string }[];
  peakAlternatives: number; boundedOut: boolean;
  projection: ReadonlyMap<number, ReadonlyMap<ReplayActor, CopyProjection>>;
  displaySegments: readonly { actor: ReplayActor; endEvent: number; reason: "complete" | "barrier" | "cap" | "no_candidate" | "contradiction"; alternatives: number; rules: string[] }[];
};

/** Independent cohort certificates can survive exhaustion of copy worlds. */
export function hasReplayCopyProofs(proofs: ReplayCopyProofs): boolean {
  return Boolean(proofs.bindings.size || proofs.relations.size || proofs.used.size || proofs.cohorts.length);
}
export type CopyProjection = { cards: CopyFact[]; moves: Array<{ sourceKey: string; kind: "damage" | "counters" | "attach" | "promote"; cardId: string; amount?: number }>; selection?: { rules: string[]; alternatives: number }; resetOrder?: boolean };
type Witness = { previous?: Witness; event: number; cards: CopyFact[]; move?: CopyProjection["moves"][number]; resetOrder?: boolean };
type World = { copies: CopyFact[]; choices: Map<string, Set<string>>; references: Map<string, string>; witness?: Witness; projectionValid?: boolean;
  orderPenalty?: number; slotPenalty?: number; preferredSlots?: boolean; creationTie?: number[]; koBatches?: Map<string, number | undefined>; orderedBatches?: Set<string> };
const stateKey = (world: World, factual: boolean) => JSON.stringify([world.copies.map((copy) => [copy.card.id, copy.card.name, copy.position, copy.positionKnown, copy.componentsOpen, copy.entered, copy.evolved,
  copy.card.damage, copy.card.damageKnown, copy.card.abilityUsed, [...copy.card.energy].sort(), copy.card.underlying.map((layer) => [layer.id, layer.name, layer.setId, layer.localId]), copy.card.tool,
  copy.card.setId, copy.card.localId, [...(copy.card.observedEffects ?? [])].sort(), copy.card.conditions,
  ...(factual ? [] : [copy.card.instanceUncertain, copy.card.hpModifierUncertain, copy.card.hpModifierBasis])]).sort(), ...(factual ? [] : [[...world.references], [...(world.koBatches ?? [])]])]);
const components = (card: ReplayCard) => [...card.underlying.map((layer) => layer.name), ...card.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(card.tool ? [card.tool] : [])];
const contains = (available: string[], required: readonly string[]) => {
  const remaining = [...available];
  return required.every((value) => { const index = remaining.indexOf(value); if (index < 0) return false; remaining.splice(index, 1); return true; });
};

/** Finite symbolic execution: intersections establish facts; a separate whole
 * witness supplies a plausible display allocation. At most 128 alternatives
 * exist per player/source segment. Unsupported facts and failed bounds refuse. */
export function solveReplayCopyConstraints(steps: readonly CopyStep[], mode: "facts" | "display" | "combined" = "combined", options: { attackKoOrderConvention?: boolean; endFrame?: number } = {}): ReplayCopyProofs {
  const bindings = new Map<string, string>();
  const relations = new Map<string, string>();
  const used = new Map<number, Array<{ actor: ReplayActor; id: string; name: string; effects: readonly string[] }>>();
  const barriers: Array<{ frameIndex: number; actor: ReplayActor; cardId?: string }> = [];
  const projection = new Map<number, Map<ReplayActor, CopyProjection>>();
  const displaySegments: Array<ReplayCopyProofs["displaySegments"][number]> = [];
  const referencedKeys = new Set(steps.flatMap((step) => [step.referenceKey, step.distinctFromKey].filter((key): key is string => Boolean(key))));
  const lastFrame = Math.max(0, ...steps.map((step) => step.event + 1));
  let peakAlternatives = 1; let boundedOut = false;
  const compare = (left: World, right: World) => {
    const penalty = (left.orderPenalty ?? 0) - (right.orderPenalty ?? 0);
    if (penalty) return penalty;
    const slots = (left.slotPenalty ?? 0) - (right.slotPenalty ?? 0);
    if (slots) return slots;
    const a = left.creationTie ?? []; const b = right.creationTie ?? [];
    for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index] - b[index];
    return a.length - b.length;
  };
  const birth = (card: ReplayCard) => {
    const source = /^action-(\d+)-(?:physical|card)-(\d+)$/.exec(card.id);
    return source ? [Number(source[1]), Number(source[2])] : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  };
  for (const actor of ["self", "opponent"] as const) {
    let worlds: World[] = [{ copies: [], choices: new Map(), references: new Map() }];
    let section = -1;
    let checkpoints: Array<{ event: number; worlds: World[] }> = [];
    const project = (endFrame = options.endFrame ?? lastFrame + 1, reason: ReplayCopyProofs["displaySegments"][number]["reason"] = "complete") => {
      // Equal-state merging unions proof choices, but retains ONE complete
      // concrete predecessor chain. Never splice independently chosen unions.
      const valid = worlds.filter((world) => world.projectionValid !== false).sort(compare);
      const selected = valid[0];
      const rules = [...(selected?.orderedBatches?.size ? ["log-order convention"] : []), ...(selected?.preferredSlots ? ["stable presentation slot"] : []), "earliest-created source tie-break"];
      displaySegments.push({ actor, endEvent: endFrame - 1, reason, alternatives: valid.length, rules });
      const path: Witness[] = []; let node = selected?.witness;
      while (node) { path.push(node); node = node.previous; }
      path.reverse();
      const movesByEvent = new Map<number, CopyProjection["moves"]>();
      for (const entry of path) if (entry.move) movesByEvent.set(entry.event, [...(movesByEvent.get(entry.event) ?? []), entry.move]);
      for (let index = 0; index < path.length; index++) {
        const checkpoint = path[index]; const from = checkpoint.event + 1;
        const to = Math.min(endFrame, path[index + 1] ? path[index + 1].event + 1 : endFrame);
        for (let frame = from; frame < to; frame++) {
          const cards = checkpoint.cards.filter((copy) => !copy.card.instanceUncertain && !copy.componentsOpen);
          if (!cards.length) continue;
          const actors = projection.get(frame) ?? new Map<ReplayActor, CopyProjection>();
          const old = actors.get(actor) ?? { cards: [], moves: [] };
          const replacing = new Set(cards.map((copy) => copy.card.id));
          const moves = frame === from ? (movesByEvent.get(checkpoint.event) ?? []).filter((move) => replacing.has(move.cardId)) : [];
          actors.set(actor, { cards: [...old.cards.filter((copy) => !replacing.has(copy.card.id)), ...cards], moves: [...old.moves.filter((move) => !replacing.has(move.cardId)), ...moves], selection: { rules, alternatives: valid.length }, ...(frame === from && checkpoint.resetOrder ? { resetOrder: true } : {}) });
          projection.set(frame, actors);
        }
      }
      return selected;
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
    for (const sourceStep of steps.filter((entry) => entry.actor === actor)) {
      let step = sourceStep;
      // An erased snapshot is an alternative, not evidence that its copy is
      // ineligible. Refuse local attribution instead of proving uniqueness by
      // removing that competitor. Complete symbolic worlds remain usable.
      if (mode !== "display" && !["barrier", "create", "checkpoint"].includes(step.kind)
        && worlds.some((world) => world.copies.some((copy) => copy.card.instanceUncertain && copy.card.name === step.name
          && (!step.targetId || copy.card.id === step.targetId)
          && (!step.position || copy.position === step.position || copy.positionKnown === false)
          && !(step.kind === "ability" && step.once && copy.card.abilityUsed)))) {
        step = { ...step, kind: "barrier" };
      }
      if (step.section !== section) { worlds.forEach((world) => { world.copies = world.copies.map((copy) => ({ ...copy, card: { ...copy.card, abilityUsed: false } })); }); section = step.section; }
      if (step.kind === "checkpoint" && mode === "display") {
        const snapshots = step.cards ?? [];
        const consistent = worlds.filter((world) => world.projectionValid !== false && world.copies.length === snapshots.length && world.copies.every((copy) => {
          const known = snapshots.find((other) => other.card.id === copy.card.id && other.card.name === copy.card.name);
          return known && (copy.card.instanceUncertain || copy.position === known.position && (copy.card.damageKnown === false || copy.card.damage === known.card.damage)
            && contains(components(known.card), components(copy.card)) && contains(components(copy.card), components(known.card)));
        }));
        if (consistent.length) worlds = consistent.map((world) => {
          const cards = structuredClone(snapshots);
          for (const copy of cards) {
            const prior = world.copies.find((other) => other.card.id === copy.card.id && other.card.name === copy.card.name);
            copy.entered ??= prior?.entered;
            copy.evolved ??= prior?.evolved;
            // A complete physical snapshot may still omit the unknown order
            // of recorded Ability uses. Preserve the concrete witness marker
            // on the same top; section resets/evolution already reset it.
            if (prior?.card.abilityUsed && copy.card.physicalCardId === prior.card.physicalCardId) copy.card.abilityUsed = true;
          }
          return { ...world, copies: cards, witness: { previous: world.witness, event: step.event, cards } };
        });
        else {
          // A complete source checkpoint starts a supported interval after an
          // erased universe. It does not repair or backfill the preceding gap.
          project(step.event, "barrier");
          const cards = structuredClone(snapshots);
          worlds = [{ copies: cards, choices: new Map(), references: new Map(), witness: { event: step.event, cards, resetOrder: true } }];
        }
        continue;
      }
      if (step.kind === "barrier") {
        if (mode === "display") {
          if (step.name === "*") {
            project(step.event + 1, "barrier");
            const cards = structuredClone(step.cards ?? []);
            worlds = [{ copies: cards, choices: new Map(), references: new Map(), witness: { event: step.event, cards } }];
          } else {
            const affected = new Set(step.barrierNames ?? [step.name]);
            // Keep every valid unaffected predecessor chain until later hard
            // evidence selects the final whole history. No early winner is
            // committed across a local source boundary.
            worlds = worlds.map((world) => {
              const retained = world.copies.filter((copy) => !affected.has(copy.card.name)
                && (step.cards ?? []).some((snapshot) => snapshot.card.id === copy.card.id && snapshot.card.name === copy.card.name));
              const retainedIds = new Set(retained.map((copy) => copy.card.id));
              const cards = [...structuredClone(retained), ...structuredClone((step.cards ?? []).filter((copy) => !retainedIds.has(copy.card.id)))];
              return { ...world, copies: cards, references: new Map([...world.references].filter(([, id]) => retainedIds.has(id))),
                witness: { previous: world.witness, event: step.event, cards } };
            });
            displaySegments.push({ actor, endEvent: step.event, reason: "barrier", alternatives: worlds.length, rules: [] });
          }
          continue;
        }
        finish();
        // Earlier proofs cannot cross a source operation whose identity effect
        // is unmodelled. Restore only the explicitly retained known snapshot.
        const universe = [...worlds.flatMap((world) => world.copies), ...(step.cards ?? [])];
        const affectedNames = new Set(step.barrierNames ?? [step.name]);
        const affected = new Set<string>();
        let grew = true;
        while (grew) {
          grew = false;
          for (const copy of universe) if (step.name === "*" || affectedNames.has(copy.card.name) || affected.has(copy.card.id)) {
            if (!affected.has(copy.card.id)) { affected.add(copy.card.id); grew = true; }
            if (!affectedNames.has(copy.card.name)) { affectedNames.add(copy.card.name); grew = true; }
          }
        }
        if (step.name === "*") barriers.push({ frameIndex: step.event + 1, actor });
        else affected.forEach((cardId) => barriers.push({ frameIndex: step.event + 1, actor, cardId }));
        worlds.forEach((world) => {
          world.copies = [...world.copies.filter((copy) => !affected.has(copy.card.id)), ...structuredClone((step.cards ?? []).filter((copy) => affected.has(copy.card.id)))];
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
        if (step.requiredEnergy) candidates = candidates.filter((copy) => copy.card.instanceUncertain || copy.componentsOpen || copy.card.energy.some((energy) => energy === step.requiredEnergy || energy === `Basic ${step.requiredEnergy} Energy` || /Energy$/i.test(energy) && !/^Basic /i.test(energy)));
        if (step.kind === "evolve" && step.timing) candidates = candidates.filter((copy) => copy.entered !== step.section && copy.evolved !== step.section);
        if (step.kind === "counters") candidates = candidates.filter((copy) => copy.card.damageKnown === false || copy.card.damage >= (step.amount ?? 0));
        if (step.kind === "ko") {
          const verdicts = candidates.map((copy) => step.lethal?.(copy.card, world.copies));
          candidates.forEach((copy, index) => { if (verdicts[index] === false) nonlethal.add(copy.card.id); });
          const lethal = candidates.filter((_, index) => verdicts[index] === true);
          if (verdicts.every((value) => value !== undefined) && lethal.length === 1) candidates = lethal;
          candidates = candidates.filter((copy) => copy.componentsOpen
            ? (step.belowTopCount === undefined || components(copy.card).length <= step.belowTopCount)
              && (step.belowTopCount !== step.belowTop?.length || contains([...(step.belowTop ?? [])], components(copy.card)))
            : contains(components(copy.card), step.belowTop ?? []) && (step.belowTopCount === undefined || components(copy.card).length === step.belowTopCount));
        }
        if (step.kind === "remove_energy") candidates = candidates.filter((copy) => copy.componentsOpen || copy.card.energy.includes(step.energy ?? ""));
        if (step.cost?.length) candidates = candidates.filter((copy) => copy.componentsOpen || contains(copy.card.energy, step.cost!.filter((type) => type !== "Colorless")) && copy.card.energy.length >= step.cost!.length);
        for (const candidate of candidates) {
          const branch: World = { copies: structuredClone(world.copies), choices: mode === "display" ? new Map() : new Map([...world.choices].map(([key, values]) => [key, new Set(values)])), references: new Map(world.references), witness: world.witness, projectionValid: world.projectionValid !== false && !nonlethal.has(candidate.card.id),
            ...(mode === "display" ? { orderPenalty: world.orderPenalty ?? 0, slotPenalty: (world.slotPenalty ?? 0) + (step.preferredId && candidate.card.id !== step.preferredId ? 1 : 0), preferredSlots: world.preferredSlots || Boolean(step.preferredId && candidates.length > 1), creationTie: [...(world.creationTie ?? []), step.event, ...birth(candidate.card)], koBatches: new Map(world.koBatches), orderedBatches: new Set(world.orderedBatches) } : {}) };
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
          if (step.kind === "counters") copy.card.damage = Math.max(0, copy.card.damage - step.amount!);
          if (step.kind === "heal") copy.card.damage = Math.max(0, copy.card.damage - step.amount!);
          if (step.kind === "remove_energy") { const index = copy.card.energy.indexOf(step.energy!); if (index >= 0) copy.card.energy.splice(index, 1); }
          if (step.kind === "ko") branch.copies = branch.copies.filter((other) => other.card.id !== copy.card.id);
          if (mode === "display" && options.attackKoOrderConvention !== false && step.attackKoBatch) {
            const batch = step.attackKoBatch;
            if (candidate.position === "active") branch.koBatches!.set(batch.id, batch.index);
            else if (!branch.koBatches!.has(batch.id)) branch.koBatches!.set(batch.id, undefined);
            if (batch.last) {
              const activeIndex = branch.koBatches!.get(batch.id);
              if (activeIndex !== undefined) { branch.orderPenalty! += Number(activeIndex > 0); branch.orderedBatches!.add(batch.id); }
              branch.koBatches!.delete(batch.id);
            }
          }
          if (mode !== "facts") branch.witness = { previous: world.witness, event: step.event, cards: branch.copies,
            ...(["damage", "counters", "attach", "promote"].includes(step.kind) ? { move: { sourceKey: step.key, kind: step.kind as CopyProjection["moves"][number]["kind"], cardId: copy.card.id, ...(step.amount !== undefined ? { amount: step.amount } : {}) } } : {}) };
          next.push(branch);
          if (next.length > 128) break worldLoop;
        }
      }
      if (!next.length || next.length > 128 || mode === "display" && next.every((world) => world.projectionValid === false)) {
        if (mode === "display") project(step.event + 1, next.length > 128 ? "cap" : !next.length ? "no_candidate" : "contradiction");
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
          if (existing.projectionValid === false && world.projectionValid !== false || mode === "display" && existing.projectionValid === world.projectionValid && compare(world, existing) < 0) {
            existing.witness = world.witness; existing.projectionValid = world.projectionValid;
            existing.orderPenalty = world.orderPenalty; existing.creationTie = world.creationTie; existing.orderedBatches = world.orderedBatches;
            existing.slotPenalty = world.slotPenalty; existing.preferredSlots = world.preferredSlots;
          }
        }
      }
      worlds = [...merged.values()]; peakAlternatives = Math.max(peakAlternatives, worlds.length);
      if (mode !== "display" && step.kind === "ability" && step.once) checkpoints.push({ event: step.event, worlds: worlds.map((world) => ({ copies: structuredClone(world.copies), choices: new Map([...world.choices].map(([key, ids]) => [key, new Set(ids)])), references: new Map(world.references) })) });
    }
    finish();
    if (mode !== "facts") project();
  }
  return { bindings, relations, used, cohorts: mode === "display" ? [] : collectAbilityCohorts(steps), barriers, peakAlternatives, boundedOut, projection, displaySegments };
}

export const replayCopyKey = (event: number, actor: ReplayActor, line: string, name: string, position?: string, ordinal = -1, role?: "donor" | "recipient") => JSON.stringify([event, actor, ordinal, line, name, position ?? null, ...(role ? [role] : [])]);
