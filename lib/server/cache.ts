import { revalidateTag } from "next/cache";

export const CACHE_TAGS = {
  identificationCatalog: "identification-catalog",
  pokemonOptions: "pokemon-options",
  siteFormats: "site-formats"
} as const;

export function invalidateReferenceDataCaches() {
  revalidateTag(CACHE_TAGS.identificationCatalog, "max");
  revalidateTag(CACHE_TAGS.pokemonOptions, "max");
  revalidateTag(CACHE_TAGS.siteFormats, "max");
}
