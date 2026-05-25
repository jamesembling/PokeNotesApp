import type { TournamentPlacement } from "@/types/index";

const TOP_EIGHT_PLACEMENT_CLASSES: Partial<Record<TournamentPlacement, string>> = {
  champion:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-200 dark:bg-amber-200 dark:text-amber-950",
  finalist:
    "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-200 dark:bg-slate-200 dark:text-slate-950",
  second:
    "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-200 dark:bg-slate-200 dark:text-slate-950",
  t4:
    "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-200 dark:bg-orange-200 dark:text-orange-950",
  third:
    "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-200 dark:bg-orange-200 dark:text-orange-950",
  fourth:
    "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-200 dark:bg-orange-200 dark:text-orange-950",
  t8:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-200 dark:bg-sky-200 dark:text-sky-950",
  fifth:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-200 dark:bg-sky-200 dark:text-sky-950",
  sixth:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-200 dark:bg-sky-200 dark:text-sky-950",
  seventh:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-200 dark:bg-sky-200 dark:text-sky-950",
  eighth:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-200 dark:bg-sky-200 dark:text-sky-950"
};

export function getTournamentPlacementPillClassName(placement: TournamentPlacement) {
  return TOP_EIGHT_PLACEMENT_CLASSES[placement] ?? "border-border bg-secondary text-secondary-foreground";
}
