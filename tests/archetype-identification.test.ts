import assert from "node:assert/strict";
import test from "node:test";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import type { IdentificationCatalog, PlayerPokemonEvidence } from "@/lib/log-import/types";

function createEvidence(slugs: string[]): PlayerPokemonEvidence {
  return {
    lines: [],
    normalizedText: "",
    mentionCounts: new Map(slugs.map((slug) => [slug, 1]))
  };
}

function createCatalog(): IdentificationCatalog {
  return {
    pokemon: {
      bySlug: new Map(),
      normalizedNameToSlug: new Map(),
      slugToAncestors: new Map([
        ["charizard", ["charmeleon", "charmander"]],
        ["charmeleon", ["charmander"]],
        ["pidgeot", ["pidgeotto", "pidgey"]],
        ["pidgeotto", ["pidgey"]],
        ["blaziken", ["combusken", "torchic"]],
        ["combusken", ["torchic"]],
        ["dusknoir", ["dusclops", "duskull"]],
        ["dusclops", ["duskull"]],
        ["dragapult", ["drakloak", "dreepy"]],
        ["drakloak", ["dreepy"]],
        ["zoroark", ["zorua"]],
        ["darmanitan", ["darumaka"]],
        ["hydreigon", ["zweilous", "deino"]],
        ["zweilous", ["deino"]],
        ["froslass-mega", ["snorunt"]],
        ["froslass", ["snorunt"]],
        ["starmie-mega", ["staryu"]]
      ]),
      slugToFamilyRoot: new Map([
        ["charizard", "charmander"],
        ["charmeleon", "charmander"],
        ["charmander", "charmander"],
        ["pidgeot", "pidgey"],
        ["pidgeotto", "pidgey"],
        ["pidgey", "pidgey"],
        ["blaziken", "torchic"],
        ["combusken", "torchic"],
        ["torchic", "torchic"],
        ["dusknoir", "duskull"],
        ["dusclops", "duskull"],
        ["duskull", "duskull"],
        ["dragapult", "dreepy"],
        ["drakloak", "dreepy"],
        ["dreepy", "dreepy"],
        ["zoroark", "zorua"],
        ["zorua", "zorua"],
        ["darmanitan", "darumaka"],
        ["darumaka", "darumaka"],
        ["hydreigon", "deino"],
        ["zweilous", "deino"],
        ["deino", "deino"],
        ["froslass-mega", "snorunt"],
        ["froslass", "snorunt"],
        ["snorunt", "snorunt"],
        ["starmie-mega", "staryu"],
        ["staryu", "staryu"]
      ]),
      maxNameTokens: 1
    },
    archetypes: {
      byId: new Map([
        [
          "charizard-pidgeot",
          {
            id: "charizard-pidgeot",
            label: "Charizard / Pidgeot",
            sprites: ["charizard", "pidgeot"],
            detectionSprites: ["charizard", "pidgeot"],
            requiredMatchGroups: [["charizard"], ["pidgeot"]]
          }
        ],
        [
          "dragapult",
          {
            id: "dragapult",
            label: "Dragapult",
            sprites: ["dragapult"],
            detectionSprites: ["dragapult"],
            requiredMatchGroups: [["dreepy", "drakloak", "dragapult"]]
          }
        ],
        [
          "blaziken+dragapult",
          {
            id: "blaziken+dragapult",
            label: "Dragapult / Blaziken",
            sprites: ["dragapult", "blaziken"],
            detectionSprites: ["dragapult", "blaziken", "dreepy", "drakloak", "torchic", "combusken"],
            requiredMatchGroups: [
              ["dreepy", "drakloak", "dragapult"],
              ["torchic", "combusken", "blaziken"]
            ]
          }
        ],
        [
          "dragapult+dusknoir",
          {
            id: "dragapult+dusknoir",
            label: "Dragapult / Dusknoir",
            sprites: ["dragapult", "dusknoir"],
            detectionSprites: ["dragapult", "dusknoir", "dreepy", "drakloak", "duskull", "dusclops"],
            requiredMatchGroups: [
              ["dreepy", "drakloak", "dragapult"],
              ["duskull", "dusclops", "dusknoir"]
            ]
          }
        ],
        [
          "snorlax",
          {
            id: "snorlax",
            label: "Snorlax",
            sprites: ["snorlax"],
            detectionSprites: ["snorlax"],
            requiredMatchGroups: []
          }
        ],
        [
          "darmanitan+zoroark",
          {
            id: "darmanitan+zoroark",
            label: "Zoroark / Darmanitan",
            sprites: ["zoroark", "darmanitan"],
            detectionSprites: ["zoroark", "darmanitan", "zorua", "darumaka"],
            requiredMatchGroups: [["zorua", "zoroark"], ["darumaka", "darmanitan"]]
          }
        ],
        [
          "froslass-mega+starmie-mega",
          {
            id: "froslass-mega+starmie-mega",
            label: "Mega Starmie / Mega Froslass",
            sprites: ["starmie-mega", "froslass-mega"],
            detectionSprites: ["starmie-mega", "froslass-mega", "staryu", "snorunt", "froslass"],
            requiredMatchGroups: [
              ["staryu", "starmie-mega"],
              ["snorunt", "froslass", "froslass-mega"]
            ]
          }
        ]
      ]),
      normalizedLabelToIds: new Map(),
      spriteToCandidateArchetypes: new Map([
        ["charizard", ["charizard-pidgeot"]],
        ["pidgeot", ["charizard-pidgeot"]],
        ["dragapult", ["dragapult", "blaziken+dragapult"]],
        ["dusknoir", ["dragapult+dusknoir"]],
        ["blaziken", ["blaziken+dragapult"]],
        ["dreepy", ["dragapult", "blaziken+dragapult"]],
        ["drakloak", ["dragapult", "blaziken+dragapult"]],
        ["duskull", ["dragapult+dusknoir"]],
        ["dusclops", ["dragapult+dusknoir"]],
        ["snorlax", ["snorlax"]],
        ["torchic", ["blaziken+dragapult"]],
        ["combusken", ["blaziken+dragapult"]],
        ["zoroark", ["darmanitan+zoroark"]],
        ["zorua", ["darmanitan+zoroark"]],
        ["darmanitan", ["darmanitan+zoroark"]],
        ["staryu", ["froslass-mega+starmie-mega"]],
        ["starmie-mega", ["froslass-mega+starmie-mega"]],
        ["snorunt", ["froslass-mega+starmie-mega"]],
        ["froslass", ["froslass-mega+starmie-mega"]],
        ["froslass-mega", ["froslass-mega+starmie-mega"]]
      ]),
      familyRootToCandidateArchetypes: new Map([
        ["charmander", ["charizard-pidgeot"]],
        ["pidgey", ["charizard-pidgeot"]],
        ["dreepy", ["dragapult", "blaziken+dragapult"]],
        ["duskull", ["dragapult+dusknoir"]],
        ["torchic", ["blaziken+dragapult"]],
        ["zorua", ["darmanitan+zoroark"]],
        ["darumaka", ["darmanitan+zoroark"]],
        ["staryu", ["froslass-mega+starmie-mega"]],
        ["snorunt", ["froslass-mega+starmie-mega"]]
      ])
    }
  };
}

test("identifyLikelyArchetype prefers multi-piece archetypes when more required groups are satisfied", () => {
  const catalog = createCatalog();

  const result = identifyLikelyArchetype({
    evidence: {
      lines: [],
      normalizedText: "dragapult ex",
      mentionCounts: new Map([
        ["dreepy", 1],
        ["drakloak", 8],
        ["dragapult", 1],
        ["torchic", 2],
        ["combusken", 1]
      ])
    },
    catalog
  });

  assert.deepEqual(result, {
    archetypeId: "blaziken+dragapult",
    label: "Dragapult / Blaziken",
    sprites: ["dragapult", "blaziken"],
    confidence: 108
  });
});

test("identifyLikelyArchetype requires every configured match group to be satisfied", () => {
  const catalog = createCatalog();

  const result = identifyLikelyArchetype({
    evidence: createEvidence(["charizard"]),
    catalog
  });

  assert.equal(result, null);
});

test("identifyLikelyArchetype counts pre-evolutions toward required match groups", () => {
  const catalog = createCatalog();

  const result = identifyLikelyArchetype({
    evidence: createEvidence(["charmeleon", "pidgey"]),
    catalog
  });

  assert.deepEqual(result, {
    archetypeId: "charizard-pidgeot",
    label: "Charizard / Pidgeot",
    sprites: ["charizard", "pidgeot"],
    confidence: 66
  });
});

test("identifyLikelyArchetype does not satisfy Dusknoir evidence with Dragapult pre-evolutions", () => {
  const catalog = createCatalog();

  const result = identifyLikelyArchetype({
    evidence: {
      lines: [],
      normalizedText: "dragapult ex",
      mentionCounts: new Map([
        ["dreepy", 3],
        ["drakloak", 5],
        ["dragapult", 1]
      ])
    },
    catalog
  });

  assert.deepEqual(result, {
    archetypeId: "dragapult",
    label: "Dragapult",
    sprites: ["dragapult"],
    confidence: 166
  });
});

test("identifyLikelyArchetype preserves legacy matching for archetypes without required groups", () => {
  const catalog = createCatalog();

  const result = identifyLikelyArchetype({
    evidence: createEvidence(["snorlax"]),
    catalog
  });

  assert.deepEqual(result, {
    archetypeId: "snorlax",
    label: "Snorlax",
    sprites: ["snorlax"],
    confidence: 21
  });
});

test("identifyLikelyArchetype does not match two-piece archetypes from one populated identify group", () => {
  const catalog = createCatalog();

  const result = identifyLikelyArchetype({
    evidence: createEvidence(["zorua", "zoroark", "deino", "zweilous", "hydreigon"]),
    catalog
  });

  assert.equal(result, null);
});

test("identifyLikelyArchetype matches two-piece archetypes when both pieces are present", () => {
  const catalog = createCatalog();

  const result = identifyLikelyArchetype({
    evidence: createEvidence(["zorua", "darmanitan"]),
    catalog
  });

  assert.deepEqual(result, {
    archetypeId: "darmanitan+zoroark",
    label: "Zoroark / Darmanitan",
    sprites: ["zoroark", "darmanitan"],
    confidence: 81
  });
});

test("identifyLikelyArchetype identifies Mega Starmie / Mega Froslass from Staryu and Froslass evidence", () => {
  const catalog = createCatalog();

  const result = identifyLikelyArchetype({
    evidence: {
      lines: [],
      normalizedText: "",
      mentionCounts: new Map([
        ["froslass", 3],
        ["froslass-mega", 2],
        ["munkidori", 7],
        ["snorunt", 5],
        ["staryu", 2]
      ])
    },
    catalog
  });

  assert.deepEqual(result, {
    archetypeId: "froslass-mega+starmie-mega",
    label: "Mega Starmie / Mega Froslass",
    sprites: ["starmie-mega", "froslass-mega"],
    confidence: 104
  });
});
