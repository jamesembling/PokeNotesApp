import assert from "node:assert/strict";
import test from "node:test";
import { getCustomArchetypeEntries } from "@/lib/pokemon-catalog/archetype-enrichments.mjs";

test("custom archetype entries preserve curated display sprites and required detection groups", () => {
  const entries = new Map(getCustomArchetypeEntries().map((entry) => [entry.id, entry]));

  assert.deepEqual(entries.get("hydrapple+ogerpon"), {
    id: "hydrapple+ogerpon",
    label: "Hydrapple / Teal Mask Ogerpon",
    sprites: ["hydrapple", "ogerpon"],
    detectionSprites: ["hydrapple", "dipplin", "applin", "ogerpon"],
    requiredMatchGroups: [["hydrapple", "dipplin", "applin"], ["ogerpon"]],
    is_excluded: false
  });

  assert.deepEqual(entries.get("kangaskhan-mega+slowking"), {
    id: "kangaskhan-mega+slowking",
    label: "Slowking / Mega Kangaskhan",
    sprites: ["slowking", "kangaskhan-mega"],
    detectionSprites: ["slowking", "slowpoke", "kangaskhan-mega"],
    requiredMatchGroups: [["slowking", "slowpoke"], ["kangaskhan-mega"]],
    is_excluded: false
  });

  assert.deepEqual(entries.get("snorlax+trevenant"), {
    id: "snorlax+trevenant",
    label: "Trevenant / Snorlax",
    sprites: ["trevenant", "snorlax"],
    detectionSprites: ["trevenant", "phantump", "snorlax"],
    requiredMatchGroups: [["trevenant", "phantump"], ["snorlax"]],
    is_excluded: false
  });

  assert.deepEqual(entries.get("genesect+metagross"), {
    id: "genesect+metagross",
    label: "Metagross / Genesect",
    sprites: ["metagross", "genesect"],
    detectionSprites: ["metagross", "metang", "beldum", "genesect"],
    requiredMatchGroups: [["metagross", "metang", "beldum"], ["genesect"]],
    is_excluded: false
  });
});
