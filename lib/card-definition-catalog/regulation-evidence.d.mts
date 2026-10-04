import type { CardDefinition } from "./types";
export function isCardRegulationEvidenceMetadata(card: unknown): boolean;
export function isCardRegulationEvidence(card: unknown): boolean;
export function hasVerifiedPrintedRegulationMarkAbsence(card: unknown): boolean;
export function applyReviewedRegulationMark(card: CardDefinition): CardDefinition;
