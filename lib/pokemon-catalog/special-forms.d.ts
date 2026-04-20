export type SpecialPokemonFormCategory = "mega" | "special-form";

export type SpecialPokemonCatalogRow = {
  slug: string;
  label: string;
  national_dex: number | null;
  stage: string;
  evolves_from: string | null;
  sprite_url: string;
  name_de: string | null;
  name_es: string | null;
  name_fr: string | null;
  name_it: string | null;
  name_pt_br: string | null;
  last_synced_at: string;
};

export function getSpecialPokemonForms(args?: {
  category?: SpecialPokemonFormCategory;
}): Array<{
  slug: string;
  label: string;
  stage: string;
  evolves_from: string | null;
  category: SpecialPokemonFormCategory;
}>;

export function buildSpecialPokemonCatalogRows(args?: {
  category?: SpecialPokemonFormCategory;
  lastSyncedAt?: string;
}): SpecialPokemonCatalogRow[];
