export type CustomArchetypeEntry = {
  id: string;
  label: string;
  sprites: string[];
  detectionSprites: string[];
  requiredMatchGroups: string[][];
  is_excluded: boolean;
};

export function getCustomArchetypeEntries(): CustomArchetypeEntry[];
export function getArchetypeEnrichment(id: string): Partial<CustomArchetypeEntry> | null;
