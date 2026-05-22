const LIMITLESS_CDN_BASE = "https://r2.limitlesstcg.net/pokemon/gen9";

const SPECIAL_POKEMON_FORMS = [
  {
    slug: "ogerpon",
    label: "Teal Mask Ogerpon",
    stage: "Basic",
    evolves_from: null,
    category: "special-form",
  },
  {
    slug: "ogerpon-cornerstone",
    label: "Cornerstone Mask Ogerpon",
    stage: "Basic",
    evolves_from: null,
    category: "special-form",
  },
  {
    slug: "ogerpon-wellspring",
    label: "Wellspring Mask Ogerpon",
    stage: "Basic",
    evolves_from: null,
    category: "special-form",
  },
  {
    slug: "ogerpon-hearthflame",
    label: "Hearthflame Mask Ogerpon",
    stage: "Basic",
    evolves_from: null,
    category: "special-form",
  },
  {
    slug: "ursaluna-bloodmoon",
    label: "Bloodmoon Ursaluna",
    stage: "Basic",
    evolves_from: null,
    category: "special-form",
  },
  {
    slug: "dialga-origin",
    label: "Origin Forme Dialga",
    stage: "Basic",
    evolves_from: null,
    category: "special-form",
  },
  {
    slug: "palkia-origin",
    label: "Origin Forme Palkia",
    stage: "Basic",
    evolves_from: null,
    category: "special-form",
  },
  {
    slug: "zoroark-hisui",
    label: "Hisuian Zoroark",
    stage: "Basic",
    evolves_from: null,
    category: "special-form",
  },
  {
    slug: "abomasnow-mega",
    label: "Mega Abomasnow",
    stage: "Stage 1",
    evolves_from: "snover",
    category: "mega",
  },
  {
    slug: "camerupt-mega",
    label: "Mega Camerupt",
    stage: "Stage 1",
    evolves_from: "numel",
    category: "mega",
  },
  {
    slug: "charizard-mega-x",
    label: "Mega Charizard X",
    stage: "Stage 2",
    evolves_from: "charmeleon",
    category: "mega",
  },
  {
    slug: "charizard-mega-y",
    label: "Mega Charizard Y",
    stage: "Stage 2",
    evolves_from: "charmeleon",
    category: "mega",
  },
  {
    slug: "clefable-mega",
    label: "Mega Clefable",
    stage: "Stage 1",
    evolves_from: "clefairy",
    category: "mega",
  },
  {
    slug: "dragonite-mega",
    label: "Mega Dragonite",
    stage: "Stage 2",
    evolves_from: "dragonair",
    category: "mega",
  },
  {
    slug: "eelektross-mega",
    label: "Mega Eelektross",
    stage: "Stage 2",
    evolves_from: "eelektrik",
    category: "mega",
  },
  {
    slug: "emboar-mega",
    label: "Mega Emboar",
    stage: "Stage 2",
    evolves_from: "pignite",
    category: "mega",
  },
  {
    slug: "feraligatr-mega",
    label: "Mega Feraligatr",
    stage: "Stage 2",
    evolves_from: "croconaw",
    category: "mega",
  },
  {
    slug: "froslass-mega",
    label: "Mega Froslass",
    stage: "Stage 1",
    evolves_from: "snorunt",
    category: "mega",
  },
  {
    slug: "floette-mega",
    label: "Mega Floette",
    stage: "Stage 1",
    evolves_from: "flabebe",
    category: "mega",
  },
  {
    slug: "gardevoir-mega",
    label: "Mega Gardevoir",
    stage: "Stage 2",
    evolves_from: "kirlia",
    category: "mega",
  },
  {
    slug: "gallade-mega",
    label: "Mega Gallade",
    stage: "Stage 2",
    evolves_from: "kirlia",
    category: "mega",
  },
  {
    slug: "gengar-mega",
    label: "Mega Gengar",
    stage: "Stage 2",
    evolves_from: "haunter",
    category: "mega",
  },
  {
    slug: "greninja-mega",
    label: "Mega Greninja",
    stage: "Stage 2",
    evolves_from: "frogadier",
    category: "mega",
  },
  {
    slug: "lopunny-mega",
    label: "Mega Lopunny",
    stage: "Stage 1",
    evolves_from: "buneary",
    category: "mega",
  },
  {
    slug: "lucario-mega",
    label: "Mega Lucario",
    stage: "Stage 1",
    evolves_from: "riolu",
    category: "mega",
  },
  {
    slug: "manectric-mega",
    label: "Mega Manectric",
    stage: "Stage 1",
    evolves_from: "electrike",
    category: "mega",
  },
  {
    slug: "dragalge-mega",
    label: "Mega Dragalge",
    stage: "Stage 1",
    evolves_from: "skrelp",
    category: "mega",
  },
  {
    slug: "meganium-mega",
    label: "Mega Meganium",
    stage: "Stage 2",
    evolves_from: "bayleef",
    category: "mega",
  },
  {
    slug: "pyroar-mega",
    label: "Mega Pyroar",
    stage: "Stage 1",
    evolves_from: "litleo",
    category: "mega",
  },
  {
    slug: "scrafty-mega",
    label: "Mega Scrafty",
    stage: "Stage 1",
    evolves_from: "scraggy",
    category: "mega",
  },
  {
    slug: "sharpedo-mega",
    label: "Mega Sharpedo",
    stage: "Stage 1",
    evolves_from: "carvanha",
    category: "mega",
  },
  {
    slug: "starmie-mega",
    label: "Mega Starmie",
    stage: "Stage 1",
    evolves_from: "staryu",
    category: "mega",
  },
  {
    slug: "venusaur-mega",
    label: "Mega Venusaur",
    stage: "Stage 2",
    evolves_from: "ivysaur",
    category: "mega",
  },
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

  return forms
    .map((form) => ({ ...form }))
    .sort(comparePokemonLabels);
}

export function buildSpecialPokemonCatalogRows({ category, lastSyncedAt } = {}) {
  const syncedAt = lastSyncedAt ?? new Date().toISOString();

  return getSpecialPokemonForms({ category }).map((form) => ({
    slug: form.slug,
    label: form.label,
    national_dex: null,
    stage: form.stage,
    evolves_from: form.evolves_from,
    sprite_url: `${LIMITLESS_CDN_BASE}/${form.slug}.png`,
    name_de: null,
    name_es: null,
    name_fr: null,
    name_it: null,
    name_pt_br: null,
    last_synced_at: syncedAt,
  }));
}
