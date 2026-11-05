const LIMITLESS_CDN_BASE = "https://r2.limitlesstcg.net/pokemon/gen9";

const SPECIAL_POKEMON_FORMS = [
  {
    slug: "rotom-heat",
    label: "Heat Rotom",
    stage: "Basic",
    evolves_from: null,
    category: "special-form"
  },
  {
    slug: "ogerpon",
    label: "Teal Mask Ogerpon",
    stage: "Basic",
    evolves_from: null,
    category: "special-form"
  },
  {
    slug: "ogerpon-cornerstone",
    label: "Cornerstone Mask Ogerpon",
    stage: "Basic",
    evolves_from: null,
    category: "special-form"
  },
  {
    slug: "ogerpon-wellspring",
    label: "Wellspring Mask Ogerpon",
    stage: "Basic",
    evolves_from: null,
    category: "special-form"
  },
  {
    slug: "ogerpon-hearthflame",
    label: "Hearthflame Mask Ogerpon",
    stage: "Basic",
    evolves_from: null,
    category: "special-form"
  },
  {
    slug: "ursaluna-bloodmoon",
    label: "Bloodmoon Ursaluna",
    stage: "Basic",
    evolves_from: null,
    category: "special-form"
  },
  {
    slug: "dialga-origin",
    label: "Origin Forme Dialga",
    stage: "Basic",
    evolves_from: null,
    category: "special-form"
  },
  {
    slug: "palkia-origin",
    label: "Origin Forme Palkia",
    stage: "Basic",
    evolves_from: null,
    category: "special-form"
  },
  {
    slug: "zoroark-hisui",
    label: "Hisuian Zoroark",
    stage: "Basic",
    evolves_from: null,
    category: "special-form"
  },
  {
    slug: "abomasnow-mega",
    label: "Mega Abomasnow",
    stage: "Stage 1",
    evolves_from: "snover",
    category: "mega"
  },
  {
    slug: "absol-mega",
    label: "Mega Absol",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "audino-mega",
    label: "Mega Audino",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "camerupt-mega",
    label: "Mega Camerupt",
    stage: "Stage 1",
    evolves_from: "numel",
    category: "mega"
  },
  {
    slug: "charizard-mega-x",
    label: "Mega Charizard X",
    stage: "Stage 2",
    evolves_from: "charmeleon",
    category: "mega"
  },
  {
    slug: "charizard-mega-y",
    label: "Mega Charizard Y",
    stage: "Stage 2",
    evolves_from: "charmeleon",
    category: "mega"
  },
  {
    slug: "clefable-mega",
    label: "Mega Clefable",
    stage: "Stage 1",
    evolves_from: "clefairy",
    category: "mega"
  },
  {
    slug: "dragonite-mega",
    label: "Mega Dragonite",
    stage: "Stage 2",
    evolves_from: "dragonair",
    category: "mega"
  },
  {
    slug: "darkrai-mega",
    label: "Mega Darkrai",
    stage: "Basic",
    evolves_from: null,
    category: "mega",
    sprite_slug: "darkrai"
  },
  {
    slug: "delphox-mega",
    label: "Mega Delphox",
    stage: "Stage 2",
    evolves_from: "braixen",
    category: "mega"
  },
  {
    slug: "eelektross-mega",
    label: "Mega Eelektross",
    stage: "Stage 2",
    evolves_from: "eelektrik",
    category: "mega"
  },
  {
    slug: "emboar-mega",
    label: "Mega Emboar",
    stage: "Stage 2",
    evolves_from: "pignite",
    category: "mega"
  },
  {
    slug: "feraligatr-mega",
    label: "Mega Feraligatr",
    stage: "Stage 2",
    evolves_from: "croconaw",
    category: "mega"
  },
  {
    slug: "froslass-mega",
    label: "Mega Froslass",
    stage: "Stage 1",
    evolves_from: "snorunt",
    category: "mega"
  },
  {
    slug: "floette-mega",
    label: "Mega Floette",
    stage: "Stage 1",
    evolves_from: "flabebe",
    category: "mega"
  },
  {
    slug: "gardevoir-mega",
    label: "Mega Gardevoir",
    stage: "Stage 2",
    evolves_from: "kirlia",
    category: "mega"
  },
  {
    slug: "gallade-mega",
    label: "Mega Gallade",
    stage: "Stage 2",
    evolves_from: "kirlia",
    category: "mega"
  },
  {
    slug: "gengar-mega",
    label: "Mega Gengar",
    stage: "Stage 2",
    evolves_from: "haunter",
    category: "mega"
  },
  {
    slug: "golisopod-mega",
    label: "Mega Golisopod",
    stage: "Stage 1",
    evolves_from: "wimpod",
    category: "mega",
    // Limitless does not yet host this form; use the dedicated Showdown sprite.
    sprite_url: "https://play.pokemonshowdown.com/sprites/gen5/golisopod-mega.png"
  },
  {
    slug: "golurk-mega",
    label: "Mega Golurk",
    stage: "Stage 1",
    evolves_from: "golett",
    category: "mega",
    sprite_url: "https://play.pokemonshowdown.com/sprites/gen5/golurk-mega.png"
  },
  {
    slug: "malamar-mega",
    label: "Mega Malamar",
    stage: "Stage 1",
    evolves_from: "inkay",
    category: "mega"
  },
  {
    slug: "rayquaza-mega",
    label: "Mega Rayquaza",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "greninja-mega",
    label: "Mega Greninja",
    stage: "Stage 2",
    evolves_from: "frogadier",
    category: "mega"
  },
  {
    slug: "heracross-mega",
    label: "Mega Heracross",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "hawlucha-mega",
    label: "Mega Hawlucha",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "kangaskhan-mega",
    label: "Mega Kangaskhan",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "latias-mega",
    label: "Mega Latias",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "lopunny-mega",
    label: "Mega Lopunny",
    stage: "Stage 1",
    evolves_from: "buneary",
    category: "mega"
  },
  {
    slug: "lucario-mega",
    label: "Mega Lucario",
    stage: "Stage 1",
    evolves_from: "riolu",
    category: "mega"
  },
  {
    slug: "manectric-mega",
    label: "Mega Manectric",
    stage: "Stage 1",
    evolves_from: "electrike",
    category: "mega"
  },
  {
    slug: "mawile-mega",
    label: "Mega Mawile",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "dragalge-mega",
    label: "Mega Dragalge",
    stage: "Stage 1",
    evolves_from: "skrelp",
    category: "mega"
  },
  {
    slug: "meganium-mega",
    label: "Mega Meganium",
    stage: "Stage 2",
    evolves_from: "bayleef",
    category: "mega"
  },
  {
    slug: "pyroar-mega",
    label: "Mega Pyroar",
    stage: "Stage 1",
    evolves_from: "litleo",
    category: "mega"
  },
  {
    slug: "scrafty-mega",
    label: "Mega Scrafty",
    stage: "Stage 1",
    evolves_from: "scraggy",
    category: "mega"
  },
  {
    slug: "skarmory-mega",
    label: "Mega Skarmory",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "sharpedo-mega",
    label: "Mega Sharpedo",
    stage: "Stage 1",
    evolves_from: "carvanha",
    category: "mega"
  },
  {
    slug: "slowbro-mega",
    label: "Mega Slowbro",
    stage: "Stage 1",
    evolves_from: "slowpoke",
    category: "mega"
  },
  {
    slug: "starmie-mega",
    label: "Mega Starmie",
    stage: "Stage 1",
    evolves_from: "staryu",
    category: "mega"
  },
  {
    slug: "venusaur-mega",
    label: "Mega Venusaur",
    stage: "Stage 2",
    evolves_from: "ivysaur",
    category: "mega"
  },
  {
    slug: "zygarde-mega",
    label: "Mega Zygarde",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "zeraora-mega",
    label: "Mega Zeraora",
    stage: "Basic",
    evolves_from: null,
    category: "mega",
    sprite_slug: "zeraora"
  },
  {
    slug: "chandelure-mega",
    label: "Mega Chandelure",
    stage: "Stage 2",
    evolves_from: "lampent",
    category: "mega"
  },
  {
    slug: "diancie-mega",
    label: "Mega Diancie",
    stage: "Basic",
    evolves_from: null,
    category: "mega"
  },
  {
    slug: "excadrill-mega",
    label: "Mega Excadrill",
    stage: "Stage 1",
    evolves_from: "drilbur",
    category: "mega"
  }
];

function comparePokemonLabels(left, right) {
  const labelComparison = left.label.localeCompare(right.label);
  if (labelComparison !== 0) {
    return labelComparison;
  }

  return left.slug.localeCompare(right.slug);
}

export function getSpecialPokemonForms({ category } = {}) {
  const forms =
    typeof category === "string"
      ? SPECIAL_POKEMON_FORMS.filter((form) => form.category === category)
      : SPECIAL_POKEMON_FORMS;

  return forms.map((form) => ({ ...form })).sort(comparePokemonLabels);
}

export function buildSpecialPokemonCatalogRows({ category, lastSyncedAt } = {}) {
  const syncedAt = lastSyncedAt ?? new Date().toISOString();

  return getSpecialPokemonForms({ category }).map((form) => ({
    slug: form.slug,
    label: form.label,
    national_dex: null,
    stage: form.stage,
    evolves_from: form.evolves_from,
    sprite_url: form.sprite_url ?? `${LIMITLESS_CDN_BASE}/${form.sprite_slug ?? form.slug}.png`,
    name_de: null,
    name_es: null,
    name_fr: null,
    name_it: null,
    name_pt_br: null,
    last_synced_at: syncedAt
  }));
}
