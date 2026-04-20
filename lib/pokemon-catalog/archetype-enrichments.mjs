export const ARCHETYPE_ENRICHMENTS = {
  garchomp: {
    sprites: ["garchomp", "roserade"],
    detectionSprites: ["garchomp", "roserade", "gabite", "gible", "roselia"]
  },
  "garchomp+roserade": {
    sprites: ["garchomp", "roserade"],
    detectionSprites: ["garchomp", "roserade", "gabite", "gible", "roselia"]
  },
  "ogerpon-meganium": {
    sprites: ["ogerpon", "meganium"],
    detectionSprites: ["ogerpon", "meganium", "bayleef", "chikorita"]
  },
  "meganium+ogerpon": {
    sprites: ["ogerpon", "meganium"],
    detectionSprites: ["ogerpon", "meganium", "bayleef", "chikorita"]
  }
};

export function getArchetypeEnrichment(id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) {
    return null;
  }

  return ARCHETYPE_ENRICHMENTS[key] ?? null;
}
