import { createClient } from "@/lib/supabase/server";
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

  return ((data ?? []) as PokemonOptionRow[])
    .filter((row) => row.slug && row.label)
    .map((row) => ({
      slug: row.slug,
      label: row.label
    }));
}
