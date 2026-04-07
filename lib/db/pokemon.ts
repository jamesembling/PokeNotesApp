import { createClient } from "@/lib/supabase/server";
import { getCustomPokemonOptions } from "@/lib/pokemon-catalog/custom-forms";
import { measureServerCall } from "@/lib/server/perf";
import type { PokemonOption } from "@/types/index";

type PokemonOptionRow = {
  slug: string;
  label: string;
};

export async function getPokemonOptions(): Promise<PokemonOption[]> {
  const supabase = createClient();

  const { data, error } = await measureServerCall("db.pokemon.options", async () =>
    await supabase.from("pokemon_catalog").select("slug,label").order("label", { ascending: true })
  );

  if (error) {
    throw error;
  }

  const combined = [
    ...((data ?? []) as PokemonOptionRow[])
      .filter((row) => row.slug && row.label)
    .map((row) => ({
      slug: row.slug,
      label: row.label
    })),
    ...getCustomPokemonOptions()
  ];

  return Array.from(new Map(combined.map((option) => [option.slug, option])).values()).sort(
    (left, right) => left.label.localeCompare(right.label)
  );
}
