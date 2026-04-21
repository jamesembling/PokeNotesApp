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
        ["drakloak", ["dreepy"]]
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
        ["dreepy", "dreepy"]
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
        ["combusken", ["blaziken+dragapult"]]
      ]),
      familyRootToCandidateArchetypes: new Map([
        ["charmander", ["charizard-pidgeot"]],
        ["pidgey", ["charizard-pidgeot"]],
        ["dreepy", ["dragapult", "blaziken+dragapult"]],
        ["duskull", ["dragapult+dusknoir"]],
        ["torchic", ["blaziken+dragapult"]]
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
