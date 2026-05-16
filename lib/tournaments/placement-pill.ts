import type { TournamentPlacement } from "@/types/index";

const TOP_EIGHT_PLACEMENT_CLASSES: Partial<Record<TournamentPlacement, string>> = {
  champion:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-400/45 dark:bg-amber-400/18 dark:text-amber-200",
  finalist:
    "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-300/35 dark:bg-slate-300/12 dark:text-slate-200",
  second:
    "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-300/35 dark:bg-slate-300/12 dark:text-slate-200",
  t4:
    "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-400/40 dark:bg-orange-400/14 dark:text-orange-200",
  third:
    "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-400/40 dark:bg-orange-400/14 dark:text-orange-200",
  fourth:
    "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-400/40 dark:bg-orange-400/14 dark:text-orange-200",
  t8:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-400/40 dark:bg-sky-400/14 dark:text-sky-200",
  fifth:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-400/40 dark:bg-sky-400/14 dark:text-sky-200",
  sixth:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-400/40 dark:bg-sky-400/14 dark:text-sky-200",
  seventh:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-400/40 dark:bg-sky-400/14 dark:text-sky-200",
  eighth:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-400/40 dark:bg-sky-400/14 dark:text-sky-200"
};

export function getTournamentPlacementPillClassName(placement: TournamentPlacement) {
  return TOP_EIGHT_PLACEMENT_CLASSES[placement] ?? "border-border bg-secondary text-secondary-foreground";
}
