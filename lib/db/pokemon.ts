import { createClient } from "@/lib/supabase/server";
import { measureServerCall } from "@/lib/server/perf";
import type { PokemonOption } from "@/types/index";

type PokemonOptionRow = {
  slug: string;
  label: string;
};

const EXTRA_POKEMON_OPTIONS: PokemonOption[] = [
  { slug: "venusaur-mega", label: "Mega Venusaur" },
  { slug: "charizard-mega-x", label: "Mega Charizard X" },
  { slug: "charizard-mega-y", label: "Mega Charizard Y" },
  { slug: "blastoise-mega", label: "Mega Blastoise" },
  { slug: "beedrill-mega", label: "Mega Beedrill" },
  { slug: "pidgeot-mega", label: "Mega Pidgeot" },
  { slug: "alakazam-mega", label: "Mega Alakazam" },
  { slug: "slowbro-mega", label: "Mega Slowbro" },
  { slug: "gengar-mega", label: "Mega Gengar" },
  { slug: "kangaskhan-mega", label: "Mega Kangaskhan" },
  { slug: "pinsir-mega", label: "Mega Pinsir" },
  { slug: "gyarados-mega", label: "Mega Gyarados" },
  { slug: "aerodactyl-mega", label: "Mega Aerodactyl" },
  { slug: "mewtwo-mega-x", label: "Mega Mewtwo X" },
  { slug: "mewtwo-mega-y", label: "Mega Mewtwo Y" },
  { slug: "ampharos-mega", label: "Mega Ampharos" },
  { slug: "steelix-mega", label: "Mega Steelix" },
  { slug: "scizor-mega", label: "Mega Scizor" },
  { slug: "heracross-mega", label: "Mega Heracross" },
  { slug: "houndoom-mega", label: "Mega Houndoom" },
  { slug: "tyranitar-mega", label: "Mega Tyranitar" },
  { slug: "sceptile-mega", label: "Mega Sceptile" },
  { slug: "blaziken-mega", label: "Mega Blaziken" },
  { slug: "swampert-mega", label: "Mega Swampert" },
  { slug: "gardevoir-mega", label: "Mega Gardevoir" },
  { slug: "sableye-mega", label: "Mega Sableye" },
  { slug: "mawile-mega", label: "Mega Mawile" },
  { slug: "aggron-mega", label: "Mega Aggron" },
  { slug: "medicham-mega", label: "Mega Medicham" },
  { slug: "manectric-mega", label: "Mega Manectric" },
  { slug: "sharpedo-mega", label: "Mega Sharpedo" },
  { slug: "camerupt-mega", label: "Mega Camerupt" },
  { slug: "altaria-mega", label: "Mega Altaria" },
  { slug: "banette-mega", label: "Mega Banette" },
  { slug: "absol-mega", label: "Mega Absol" },
  { slug: "glalie-mega", label: "Mega Glalie" },
  { slug: "salamence-mega", label: "Mega Salamence" },
  { slug: "metagross-mega", label: "Mega Metagross" },
  { slug: "latias-mega", label: "Mega Latias" },
  { slug: "latios-mega", label: "Mega Latios" },
  { slug: "rayquaza-mega", label: "Mega Rayquaza" },
  { slug: "lopunny-mega", label: "Mega Lopunny" },
  { slug: "garchomp-mega", label: "Mega Garchomp" },
  { slug: "lucario-mega", label: "Mega Lucario" },
  { slug: "abomasnow-mega", label: "Mega Abomasnow" },
  { slug: "gallade-mega", label: "Mega Gallade" },
  { slug: "audino-mega", label: "Mega Audino" },
  { slug: "diancie-mega", label: "Mega Diancie" }
];

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
    ...EXTRA_POKEMON_OPTIONS
  ];

  return Array.from(new Map(combined.map((option) => [option.slug, option])).values()).sort(
    (left, right) => left.label.localeCompare(right.label)
  );
}
