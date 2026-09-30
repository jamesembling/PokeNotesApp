import type { ReplayEvent, ReplayState } from "./prototype";

export type ReplayCondition = "Poisoned" | "Burned" | "Asleep";

/** Carry only evidenced conditions; never infer them from an attack name. */
export function applyReplayConditions(previous: ReplayState, next: ReplayState, event: Pick<ReplayEvent, "sourceTitle" | "sourceDetails">, selfPlayerName: string) {
  for (const actor of ["self", "opponent"] as const) {
    const active = next[actor].active;
    for (const card of next[actor].bench) card.conditions = [];
    if (!active) continue;
    const before = previous[actor].active;
    active.conditions = before?.id === active.id && before.name === active.name ? [...(before.conditions ?? [])] : [];
    for (const raw of [event.sourceTitle, ...event.sourceDetails]) {
      const line = raw.trim().replace(/^[-•]\s*/, "").replace(/[.!]$/, "");
      const owned = line.match(/^(.+?)[’']s (.+)$/);
      if (!owned || (owned[1] === selfPlayerName ? "self" : "opponent") !== actor) continue;
      if (!owned[2].startsWith(`${active.name} `)) continue;
      const effect = owned[2].slice(active.name.length + 1);
      const recovered = effect.match(/^(?:recovered from|is no longer) (Poisoned|Burned|Asleep|Poison|Burn|Sleep)$/i);
      if (recovered) {
        const condition = /^poison/i.test(recovered[1]) ? "Poisoned" : /^burn/i.test(recovered[1]) ? "Burned" : "Asleep";
        active.conditions = active.conditions.filter((item) => item !== condition);
      } else if (/^(?:woke up|recovered from all Special Conditions)$/i.test(effect)) {
        active.conditions = /^woke/i.test(effect) ? active.conditions.filter((item) => item !== "Asleep") : [];
      } else {
        const applied = effect.match(/^(?:is now|was|became|is) (Poisoned|Burned|Asleep|Paralyzed|Confused)$/i);
        if (!applied) continue;
        if (/^(Asleep|Paralyzed|Confused)$/i.test(applied[1])) active.conditions = active.conditions.filter((item) => item !== "Asleep");
        const condition = (["Poisoned", "Burned", "Asleep"] as const).find((item) => item.toLowerCase() === applied[1].toLowerCase());
        if (condition && !active.conditions.includes(condition)) active.conditions.push(condition);
      }
    }
  }
  return next;
}
