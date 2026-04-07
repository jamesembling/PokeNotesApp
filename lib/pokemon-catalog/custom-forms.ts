import customForms from "@/lib/pokemon-catalog/custom-forms.json";
import type { PokemonCatalogRow } from "@/lib/log-import/types";
import type { PokemonOption } from "@/types/index";

const LIMITLESS_CDN_BASE = "https://r2.limitlesstcg.net/pokemon/gen9";

type CustomPokemonForm = {
  slug: string;
  label: string;
  evolvesFrom: string;
  stage: "Basic" | "Stage 1" | "Stage 2";
};

function mapCustomFormToCatalogRow(form: CustomPokemonForm): PokemonCatalogRow {
  return {
    slug: form.slug,
    label: form.label,
    evolves_from: form.evolvesFrom,
    sprite_url: `${LIMITLESS_CDN_BASE}/${form.slug}.png`,
    name_de: null,
    name_es: null,
    name_fr: null,
    name_it: null,
    name_pt_br: null
  };
}

export function getCustomPokemonForms() {
  return customForms as CustomPokemonForm[];
}

export function getCustomPokemonCatalogRows() {
  return getCustomPokemonForms().map(mapCustomFormToCatalogRow);
}

export function getCustomPokemonOptions(): PokemonOption[] {
  return getCustomPokemonForms().map((form) => ({
    slug: form.slug,
    label: form.label
  }));
}
