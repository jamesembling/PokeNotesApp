import assert from "node:assert/strict";
import test from "node:test";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import { selectDeckSprites } from "@/lib/log-import/identifier/sprites";
import type {
  ArchetypeIdentification,
  IdentificationCatalog,
  PlayerPokemonEvidence,
  PokemonCatalogRow
} from "@/lib/log-import/types";

function createEvidence(slugs: string[]): PlayerPokemonEvidence {
  return {
    lines: [],
    normalizedText: "",
    mentionCounts: new Map(slugs.map((slug) => [slug, 1]))
  };
}

function createEvidenceWithCounts(
  counts: Array<[string, number]>,
  normalizedText = ""
): PlayerPokemonEvidence {
  return {
    lines: [],
    normalizedText,
    mentionCounts: new Map(counts)
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
        ["starmie-mega", ["staryu"]],
        ["hydrapple", ["dipplin", "applin"]],
        ["dipplin", ["applin"]],
        ["meganium", ["bayleef", "chikorita"]],
        ["bayleef", ["chikorita"]]
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
        ["staryu", "staryu"],
        ["hydrapple", "applin"],
        ["dipplin", "applin"],
        ["applin", "applin"],
        ["meganium", "chikorita"],
        ["bayleef", "chikorita"],
        ["chikorita", "chikorita"],
        ["ogerpon", "ogerpon"]
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
        ],
        [
          "hydrapple+ogerpon",
          {
            id: "hydrapple+ogerpon",
            label: "Hydrapple / Teal Mask Ogerpon",
            sprites: ["hydrapple", "ogerpon"],
            detectionSprites: ["hydrapple", "dipplin", "applin", "ogerpon"],
            requiredMatchGroups: [["hydrapple", "dipplin", "applin"], ["ogerpon"]]
          }
        ],
        [
          "meganium+ogerpon",
          {
            id: "meganium+ogerpon",
            label: "Teal Mask Ogerpon / Meganium",
            sprites: ["ogerpon", "meganium"],
            detectionSprites: ["ogerpon", "meganium", "bayleef", "chikorita"],
            requiredMatchGroups: [["ogerpon"], ["meganium", "bayleef", "chikorita"]]
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
        ["froslass-mega", ["froslass-mega+starmie-mega"]],
        ["hydrapple", ["hydrapple+ogerpon"]],
        ["dipplin", ["hydrapple+ogerpon"]],
        ["applin", ["hydrapple+ogerpon"]],
        ["ogerpon", ["hydrapple+ogerpon", "meganium+ogerpon"]],
        ["meganium", ["meganium+ogerpon"]],
        ["bayleef", ["meganium+ogerpon"]],
        ["chikorita", ["meganium+ogerpon"]]
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
        ["snorunt", ["froslass-mega+starmie-mega"]],
        ["applin", ["hydrapple+ogerpon"]],
        ["ogerpon", ["hydrapple+ogerpon", "meganium+ogerpon"]],
        ["chikorita", ["meganium+ogerpon"]]
      ])
    }
  };
}

function addPokemon(
  catalog: IdentificationCatalog,
  slug: string,
  ancestors: string[] = []
) {
  const row: PokemonCatalogRow = {
    slug,
    label: slug,
    evolves_from: ancestors[0] ?? null,
    sprite_url: "",
    name_de: null,
    name_es: null,
    name_fr: null,
    name_it: null,
    name_pt_br: null
  };

  catalog.pokemon.bySlug.set(slug, row);
  catalog.pokemon.slugToAncestors.set(slug, ancestors);
  catalog.pokemon.slugToFamilyRoot.set(slug, ancestors[ancestors.length - 1] ?? slug);
}

test("identifyLikelyArchetype applies the candidate scoring decision table", () => {
  const cases = [
    {
      name: "prefers the multi-piece archetype with more matched groups",
      evidence: () =>
        createEvidenceWithCounts(
          [["dreepy", 1], ["drakloak", 8], ["dragapult", 1], ["torchic", 2], ["combusken", 1]],
          "dragapult ex"
        ),
      expected: {
        archetypeId: "blaziken+dragapult",
        label: "Dragapult / Blaziken",
        sprites: ["dragapult", "blaziken"],
        confidence: 108
      }
    },
    {
      name: "requires every configured match group",
      evidence: () => createEvidence(["charizard"]),
      expected: null
    },
    {
      name: "counts pre-evolutions toward required groups",
      evidence: () => createEvidence(["charmeleon", "pidgey"]),
      expected: {
        archetypeId: "charizard-pidgeot",
        label: "Charizard / Pidgeot",
        sprites: ["charizard", "pidgeot"],
        confidence: 66
      }
    },
    {
      name: "does not satisfy Dusknoir with Dragapult evidence",
      evidence: () =>
        createEvidenceWithCounts(
          [["dreepy", 3], ["drakloak", 5], ["dragapult", 1]],
          "dragapult ex"
        ),
      expected: {
        archetypeId: "dragapult",
        label: "Dragapult",
        sprites: ["dragapult"],
        confidence: 166
      }
    },
    {
      name: "preserves legacy matching without required groups",
      evidence: () => createEvidence(["snorlax"]),
      expected: {
        archetypeId: "snorlax",
        label: "Snorlax",
        sprites: ["snorlax"],
        confidence: 21
      }
    },
    {
      name: "rejects a two-piece archetype with one populated group",
      evidence: () => createEvidence(["zorua", "zoroark", "deino", "zweilous", "hydreigon"]),
      expected: null
    },
    {
      name: "matches a two-piece archetype when both groups are present",
      evidence: () => createEvidence(["zorua", "darmanitan"]),
      expected: {
        archetypeId: "darmanitan+zoroark",
        label: "Zoroark / Darmanitan",
        sprites: ["zoroark", "darmanitan"],
        confidence: 81
      }
    },
    {
      name: "identifies Mega Starmie and Mega Froslass from family evidence",
      evidence: () =>
        createEvidenceWithCounts([
          ["froslass", 3],
          ["froslass-mega", 2],
          ["munkidori", 7],
          ["snorunt", 5],
          ["staryu", 2]
        ]),
      expected: {
        archetypeId: "froslass-mega+starmie-mega",
        label: "Mega Starmie / Mega Froslass",
        sprites: ["starmie-mega", "froslass-mega"],
        confidence: 104
      }
    },
    {
      name: "identifies Hydrapple and Ogerpon from both groups",
      evidence: () => createEvidence(["applin", "ogerpon"]),
      expected: {
        archetypeId: "hydrapple+ogerpon",
        label: "Hydrapple / Teal Mask Ogerpon",
        sprites: ["hydrapple", "ogerpon"],
        confidence: 82
      }
    },
    {
      name: "does not identify Hydrapple and Ogerpon from Ogerpon alone",
      evidence: () => createEvidence(["ogerpon"]),
      expected: null
    }
  ];

  for (const scenario of cases) {
    assert.deepEqual(
      identifyLikelyArchetype({ evidence: scenario.evidence(), catalog: createCatalog() }),
      scenario.expected,
      scenario.name
    );
  }
});

test("selectDeckSprites applies the archetype and fallback family decision table", () => {
  const cases = [
    {
      name: "falls back when a one-off archetype has a different family",
      run: () => {
        const catalog = createCatalog();
        addPokemon(catalog, "riolu");
        addPokemon(catalog, "lucario-mega", ["riolu"]);
        addPokemon(catalog, "okidogi");
        addPokemon(catalog, "fezandipiti");
        addPokemon(catalog, "lunatone");
        addPokemon(catalog, "solrock");

        return selectDeckSprites({
          archetype: {
            archetypeId: "okidogi",
            label: "Okidogi",
            sprites: ["okidogi"],
            confidence: 147
          },
          evidence: createEvidenceWithCounts([
            ["riolu", 9],
            ["lucario-mega", 5],
            ["fezandipiti", 2],
            ["lunatone", 2],
            ["solrock", 2],
            ["okidogi", 1]
          ], "okidogi"),
          catalog
        });
      },
      expected: {
        slugs: ["lucario-mega", "fezandipiti"],
        confidence: 10,
        selectionSource: "fallback"
      }
    },
    {
      name: "keeps a one-off archetype from the strongest family",
      run: () => {
        const catalog = createCatalog();
        addPokemon(catalog, "dreepy");
        addPokemon(catalog, "dragapult", ["drakloak", "dreepy"]);
        addPokemon(catalog, "fezandipiti");

        return selectDeckSprites({
          archetype: {
            archetypeId: "dragapult",
            label: "Dragapult",
            sprites: ["dragapult"],
            confidence: 166
          },
          evidence: createEvidenceWithCounts([
            ["dreepy", 9],
            ["dragapult", 1],
            ["fezandipiti", 2]
          ], "dragapult"),
          catalog
        });
      },
      expected: {
        slugs: ["dragapult"],
        confidence: 166,
        selectionSource: "archetype"
      }
    }
  ];

  for (const scenario of cases) {
    assert.deepEqual(scenario.run(), scenario.expected, scenario.name);
  }
});
