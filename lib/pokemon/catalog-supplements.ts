import { buildPokemonSpriteUrlFromSlug } from "@/lib/pokemon/sprites";
import type { PokemonCatalogRow } from "@/lib/log-import/types";
import type { PokemonOption } from "@/types/index";

type SupplementalPokemonForm = {
  slug: string;
  label: string;
  evolves_from: string | null;
};

const SUPPLEMENTAL_POKEMON_FORMS: SupplementalPokemonForm[] = [
  {
    slug: "ogerpon",
    label: "Teal Mask Ogerpon",
    evolves_from: null
  },
  {
    slug: "ogerpon-cornerstone",
    label: "Cornerstone Mask Ogerpon",
    evolves_from: null
  },
  {
    slug: "ogerpon-wellspring",
    label: "Wellspring Mask Ogerpon",
    evolves_from: null
  },
  {
    slug: "ogerpon-hearthflame",
    label: "Hearthflame Mask Ogerpon",
    evolves_from: null
  },
  {
    slug: "ursaluna-bloodmoon",
    label: "Bloodmoon Ursaluna",
    evolves_from: null
  },
  {
    slug: "dialga-origin",
    label: "Origin Forme Dialga",
    evolves_from: null
  },
  {
    slug: "palkia-origin",
    label: "Origin Forme Palkia",
    evolves_from: null
  },
  {
    slug: "zoroark-hisui",
    label: "Hisuian Zoroark",
    evolves_from: null
  }
];

function comparePokemonLabels(
  left: Pick<PokemonOption, "label" | "slug">,
  right: Pick<PokemonOption, "label" | "slug">
) {
  const labelComparison = left.label.localeCompare(right.label);
  if (labelComparison !== 0) {
    return labelComparison;
  }

  return left.slug.localeCompare(right.slug);
}

export function getSupplementalPokemonCatalogRows(): PokemonCatalogRow[] {
  return SUPPLEMENTAL_POKEMON_FORMS.map((form) => ({
    ...form,
    sprite_url: buildPokemonSpriteUrlFromSlug(form.slug),
    name_de: null,
    name_es: null,
    name_fr: null,
    name_it: null,
    name_pt_br: null
  }));
}

export function getSupplementalPokemonOptions(): PokemonOption[] {
  return SUPPLEMENTAL_POKEMON_FORMS.map((form) => ({
    slug: form.slug,
    label: form.label,
    spriteUrl: buildPokemonSpriteUrlFromSlug(form.slug)
  }));
}

export function mergePokemonCatalogRows(rows: PokemonCatalogRow[]) {
  const mergedBySlug = new Map<string, PokemonCatalogRow>();

  rows.forEach((row) => {
    mergedBySlug.set(row.slug, row);
  });

  getSupplementalPokemonCatalogRows().forEach((row) => {
    const existingRow = mergedBySlug.get(row.slug);
    mergedBySlug.set(row.slug, existingRow ? { ...existingRow, ...row } : row);
  });

  return Array.from(mergedBySlug.values()).sort(comparePokemonLabels);
}

export function mergePokemonOptions(options: PokemonOption[]) {
  const mergedBySlug = new Map<string, PokemonOption>();

  options.forEach((option) => {
    mergedBySlug.set(option.slug, option);
  });

  getSupplementalPokemonOptions().forEach((option) => {
    const existingOption = mergedBySlug.get(option.slug);
    mergedBySlug.set(option.slug, existingOption ? { ...existingOption, ...option } : option);
  });

  return Array.from(mergedBySlug.values()).sort(comparePokemonLabels);
}
