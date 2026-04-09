import { revalidateTag } from "next/cache";

export const CACHE_TAGS = {
  identificationCatalog: "identification-catalog",
  pokemonOptions: "pokemon-options"
} as const;

export function invalidateReferenceDataCaches() {
  revalidateTag(CACHE_TAGS.identificationCatalog);
  revalidateTag(CACHE_TAGS.pokemonOptions);
}
