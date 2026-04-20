import { buildPokemonSpriteUrlFromSlug } from "@/lib/pokemon/sprites";
import type { PokemonOption } from "@/types/index";
import { getSpecialPokemonForms } from "@/lib/pokemon-catalog/special-forms.mjs";

export type RequiredPokemonCatalogEntry = {
  aliases: string[];
  label: string;
  slug: string;
};

export type SearchQueryExpectation = {
  bestMatch: string | null;
  expectedSlugs: string[];
  query: string;
};

const REQUIRED_ALIASES_BY_SLUG: Record<string, string[]> = {
  "charizard-mega-x": ["Mega Charizard X", "Charizard Mega X", "charizardmegax"],
  "dialga-origin": ["Origin Forme Dialga", "Dialga Origin"],
  "greninja-mega": ["Mega Greninja", "Greninja Mega"],
  "ogerpon": ["Teal Mask Ogerpon"],
  "ogerpon-cornerstone": ["Cornerstone Mask Ogerpon"],
  "ogerpon-hearthflame": ["Hearthflame Mask Ogerpon"],
  "ogerpon-wellspring": ["Wellspring Mask Ogerpon"],
  "palkia-origin": ["Origin Forme Palkia", "Palkia Origin"],
  "sharpedo-mega": ["Mega Sharpedo", "Sharpedo Mega"],
  "ursaluna-bloodmoon": ["Bloodmoon Ursaluna"],
  "zoroark-hisui": ["Hisuian Zoroark", "Zoroark Hisui"]
};

export const DISALLOWED_POKEMON_OPTION_SLUGS = [
  "charizard-x-mega",
  "dialga-origin-forme",
  "ogerpon-teal-mask",
  "palkia-origin-forme",
  "zoroark-hisuian"
] as const;

export const DISALLOWED_POKEMON_OPTION_LABELS = [
  "Dialga Origin",
  "Ogerpon Teal Mask",
  "Palkia Origin",
  "Zoroark Hisui"
] as const;

export const SEARCH_QUERY_EXPECTATIONS: SearchQueryExpectation[] = [
  {
    bestMatch: "greninja-mega",
    expectedSlugs: ["greninja-mega"],
    query: "Mega Greninja"
  },
  {
    bestMatch: "sharpedo-mega",
    expectedSlugs: ["sharpedo-mega"],
    query: "mega sharpedo"
  },
  {
    bestMatch: "charizard-mega-x",
    expectedSlugs: ["charizard-mega-x"],
    query: "charizard mega x"
  },
  {
    bestMatch: "charizard-mega-x",
    expectedSlugs: ["charizard-mega-x"],
    query: "charizardmegax"
  },
  {
    bestMatch: "ogerpon-wellspring",
    expectedSlugs: ["ogerpon-wellspring"],
    query: "wellspring"
  },
  {
    bestMatch: "zoroark-hisui",
    expectedSlugs: ["zoroark-hisui"],
    query: "hisui"
  },
  {
    bestMatch: "ogerpon",
    expectedSlugs: [
      "ogerpon",
      "ogerpon-cornerstone",
      "ogerpon-hearthflame",
      "ogerpon-wellspring"
    ],
    query: "ogerpon"
  },
  {
    bestMatch: null,
    expectedSlugs: ["dialga-origin", "palkia-origin"],
    query: "origin"
  }
];

export function getRequiredPokemonCatalogEntries(): RequiredPokemonCatalogEntry[] {
  return getSpecialPokemonForms().map((form) => ({
    aliases: REQUIRED_ALIASES_BY_SLUG[form.slug] ?? [],
    label: form.label,
    slug: form.slug
  }));
}

export function buildRequiredPokemonOptions(): PokemonOption[] {
  return getRequiredPokemonCatalogEntries().map((entry) => ({
    label: entry.label,
    slug: entry.slug,
    spriteUrl: buildPokemonSpriteUrlFromSlug(entry.slug)
  }));
}
