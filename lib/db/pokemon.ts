import { unstable_cache } from "next/cache";
import { POKEMON_OPTIONS_REVALIDATE_SECONDS } from "@/lib/cache/freshness";
import { buildPokemonSpriteUrlFromSlug } from "@/lib/pokemon/sprites";
import { CACHE_TAGS } from "@/lib/server/cache";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createPublicClient } from "@/lib/supabase/public";
import { measureServerCall } from "@/lib/server/perf";
import type { PokemonOption } from "@/types/index";

type PokemonOptionRow = {
  slug: string;
  label: string;
  sprite_url: string;
};

const POKEMON_OPTIONS_CACHE_VERSION = "v6";

const getPokemonOptionsCached = unstable_cache(
  async (): Promise<PokemonOption[]> => {
    const supabase = createPublicClient();

    const data = await measureServerCall("db.pokemon.options", async () =>
      await fetchAllRows<PokemonOptionRow>((from, to) =>
        supabase
          .from("pokemon_catalog")
          .select("slug,label,sprite_url")
          .order("label", { ascending: true })
          .range(from, to)
      )
    );

    const options = ((data ?? []) as PokemonOptionRow[])
      .filter((row) => row.slug && row.label)
      .map((row) => ({
        slug: row.slug,
        label: row.label,
        spriteUrl:
          typeof row.sprite_url === "string" && row.sprite_url
            ? row.sprite_url
            : buildPokemonSpriteUrlFromSlug(row.slug)
      }));

    return options;
  },
  ["pokemon-options", POKEMON_OPTIONS_CACHE_VERSION],
  {
    revalidate: POKEMON_OPTIONS_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.pokemonOptions]
  }
);

export async function getPokemonOptions() {
  return getPokemonOptionsCached();
}
