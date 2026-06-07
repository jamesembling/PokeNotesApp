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
  },
  "hydrapple+ogerpon": {
    label: "Hydrapple / Teal Mask Ogerpon",
    sprites: ["hydrapple", "ogerpon"],
    detectionSprites: ["hydrapple", "dipplin", "applin", "ogerpon"],
    requiredMatchGroups: [
      ["hydrapple", "dipplin", "applin"],
      ["ogerpon"]
    ]
  },
  "kangaskhan-mega+slowking": {
    label: "Slowking / Mega Kangaskhan",
    sprites: ["slowking", "kangaskhan-mega"],
    detectionSprites: ["slowking", "slowpoke", "kangaskhan-mega"],
    requiredMatchGroups: [
      ["slowking", "slowpoke"],
      ["kangaskhan-mega"]
    ]
  },
  "snorlax+trevenant": {
    label: "Trevenant / Snorlax",
    sprites: ["trevenant", "snorlax"],
    detectionSprites: ["trevenant", "phantump", "snorlax"],
    requiredMatchGroups: [
      ["trevenant", "phantump"],
      ["snorlax"]
    ]
  },
  "genesect+metagross": {
    label: "Metagross / Genesect",
    sprites: ["metagross", "genesect"],
    detectionSprites: ["metagross", "metang", "beldum", "genesect"],
    requiredMatchGroups: [
      ["metagross", "metang", "beldum"],
      ["genesect"]
    ]
  },
  "froslass-mega+starmie-mega": {
    sprites: ["starmie-mega", "froslass-mega"],
    detectionSprites: ["starmie-mega", "froslass-mega", "staryu", "snorunt", "froslass"],
    requiredMatchGroups: [
      ["staryu", "starmie-mega"],
      ["snorunt", "froslass", "froslass-mega"]
    ]
  }
};

export function getArchetypeEnrichment(id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) {
    return null;
  }

  return ARCHETYPE_ENRICHMENTS[key] ?? null;
}

export function getCustomArchetypeEntries() {
  return Object.entries(ARCHETYPE_ENRICHMENTS)
    .filter(([, enrichment]) => typeof enrichment.label === "string" && enrichment.label.trim())
    .map(([id, enrichment]) => ({
      id,
      label: enrichment.label.trim(),
      sprites: enrichment.sprites ?? [],
      detectionSprites: enrichment.detectionSprites ?? enrichment.sprites ?? [],
      requiredMatchGroups: enrichment.requiredMatchGroups ?? [],
      is_excluded: false
    }));
}
