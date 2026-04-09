import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/server/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { measureServerCall } from "@/lib/server/perf";
import type { PokemonOption } from "@/types/index";

type PokemonOptionRow = {
  slug: string;
  label: string;
};

const getPokemonOptionsCached = unstable_cache(
  async (): Promise<PokemonOption[]> => {
    const supabase = createPublicClient();

    const { data, error } = await measureServerCall("db.pokemon.options", async () =>
      await supabase.from("pokemon_catalog").select("slug,label").order("label", { ascending: true })
    );

    if (error) {
      throw error;
    }

    return ((data ?? []) as PokemonOptionRow[])
      .filter((row) => row.slug && row.label)
      .map((row) => ({
        slug: row.slug,
        label: row.label
      }));
  },
  ["pokemon-options"],
  {
    revalidate: 60 * 60,
    tags: [CACHE_TAGS.pokemonOptions]
  }
);

export async function getPokemonOptions() {
  return getPokemonOptionsCached();
}
