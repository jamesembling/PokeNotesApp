import type { TournamentPlacement } from "@/types/index";

const TOP_EIGHT_PLACEMENT_CLASSES: Partial<Record<TournamentPlacement, string>> = {
  champion:
    "border-[var(--placement-champion-border)] bg-[var(--placement-champion-bg)] text-[var(--placement-champion-text)]",
  finalist:
    "border-[var(--placement-finalist-border)] bg-[var(--placement-finalist-bg)] text-[var(--placement-finalist-text)]",
  second:
    "border-[var(--placement-finalist-border)] bg-[var(--placement-finalist-bg)] text-[var(--placement-finalist-text)]",
  t4:
    "border-[var(--placement-top4-border)] bg-[var(--placement-top4-bg)] text-[var(--placement-top4-text)]",
  third:
    "border-[var(--placement-top4-border)] bg-[var(--placement-top4-bg)] text-[var(--placement-top4-text)]",
  fourth:
    "border-[var(--placement-top4-border)] bg-[var(--placement-top4-bg)] text-[var(--placement-top4-text)]",
  t8:
    "border-[var(--placement-top8-border)] bg-[var(--placement-top8-bg)] text-[var(--placement-top8-text)]",
  fifth:
    "border-[var(--placement-top8-border)] bg-[var(--placement-top8-bg)] text-[var(--placement-top8-text)]",
  sixth:
    "border-[var(--placement-top8-border)] bg-[var(--placement-top8-bg)] text-[var(--placement-top8-text)]",
  seventh:
    "border-[var(--placement-top8-border)] bg-[var(--placement-top8-bg)] text-[var(--placement-top8-text)]",
  eighth:
    "border-[var(--placement-top8-border)] bg-[var(--placement-top8-bg)] text-[var(--placement-top8-text)]"
};

export function getTournamentPlacementPillClassName(placement: TournamentPlacement) {
  return TOP_EIGHT_PLACEMENT_CLASSES[placement] ?? "border-border bg-secondary text-secondary-foreground";
}
