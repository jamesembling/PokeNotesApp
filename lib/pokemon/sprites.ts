import type { PokemonOption } from "@/types/index";

const normalizedPokemonOptionLookupCache = new WeakMap<PokemonOption[], Map<string, string>>();
const pokemonOptionsBySlugCache = new WeakMap<PokemonOption[], Map<string, PokemonOption>>();

const EXPLICIT_NAME_TO_SLUG: Record<string, string> = {
  "teal mask ogerpon": "ogerpon",
  "cornerstone mask ogerpon": "ogerpon-cornerstone",
  "wellspring mask ogerpon": "ogerpon-wellspring",
  "hearthflame mask ogerpon": "ogerpon-hearthflame",
  "bloodmoon ursaluna": "ursaluna-bloodmoon",
  "origin forme dialga": "dialga-origin",
  "dialga origin": "dialga-origin",
  "dialga origin forme": "dialga-origin",
  "origin forme palkia": "palkia-origin",
  "palkia origin": "palkia-origin",
  "palkia origin forme": "palkia-origin",
  "hisuian zoroark": "zoroark-hisui",
  "zoroark hisui": "zoroark-hisui"
};

const CUSTOM_SPRITE_URLS: Record<string, string> = {
  "crushing-hammer": "/pixelated-hammer-sprite-transparent.png"
};

export const CUSTOM_SPRITE_OPTIONS: PokemonOption[] = [
  {
    slug: "crushing-hammer",
    label: "Crushing Hammer",
    spriteUrl: CUSTOM_SPRITE_URLS["crushing-hammer"]
  }
];

export function prettifyPokemonSlug(slug: string) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripTrainerPrefix(value: string) {
  return String(value || "")
    .trim()
    .replace(/^(?:[A-Za-z]+(?:[ .-][A-Za-z]+)*)[’']s\s+/i, "");
}

function normalizePokemonText(value: string) {
  return stripTrainerPrefix(
    String(value || "")
      .trim()
      .replace(/^Stage\s+[12]\s+/i, "")
      .replace(/^Basic\s+/i, "")
  )
    .trim()
    .replace(/\b(ex|vstar|vmax|v|gx)\b/gi, " ")
    .replace(/[’']/g, "")
    .replace(/\./g, " ")
    .replace(/:/g, " ")
    .replace(/♀/g, " f ")
    .replace(/♂/g, " m ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildLegacySpriteSlug(name: string) {
  const clean = normalizePokemonText(name);
  const explicitMap: Record<string, string> = {
    ...EXPLICIT_NAME_TO_SLUG,
    "mr mime": "mr-mime",
    "mr rime": "mr-rime",
    "mime jr": "mime-jr",
    "type null": "type-null",
    "ho oh": "ho-oh",
    "porygon z": "porygon-z",
    "jangmo o": "jangmo-o",
    "hakamo o": "hakamo-o",
    "kommo o": "kommo-o"
  };

  if (explicitMap[clean]) {
    return explicitMap[clean];
  }

  let tokens = clean.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return "unknown";
  }

  if (tokens[0] === "mega" && tokens.length > 1) {
    const suffix = tokens[tokens.length - 1];
    if ((suffix === "x" || suffix === "y") && tokens.length > 2) {
      tokens = tokens.slice(1, -1).concat("mega", suffix);
    } else {
      tokens = tokens.slice(1).concat("mega");
    }
  }
  if (tokens[0] === "bloodmoon" && tokens.length > 1) {
    tokens = tokens.slice(1).concat("bloodmoon");
  }
  if (tokens[0] === "radiant" && tokens.length > 1) {
    tokens = tokens.slice(1).concat("radiant");
  }

  const regionalSuffixes: Record<string, string> = {
    alolan: "alola",
    galarian: "galar",
    hisuian: "hisui",
    paldean: "paldea"
  };
  if (regionalSuffixes[tokens[0]] && tokens.length > 1) {
    tokens = tokens.slice(1).concat(regionalSuffixes[tokens[0]]);
  }

  return tokens.join("-").replace(/[^a-z0-9-]/g, "");
}

function buildPokemonNameCandidates(name: string) {
  const normalized = normalizePokemonText(name);
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>([normalized]);
  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens[0] === "mega" && tokens.length > 1) {
    const suffix = tokens[tokens.length - 1];
    if ((suffix === "x" || suffix === "y") && tokens.length > 2) {
      candidates.add(`${tokens.slice(1, -1).join(" ")} mega ${suffix}`);
    } else {
      candidates.add(`${tokens.slice(1).join(" ")} mega`);
    }
  }
  if (tokens[0] === "bloodmoon" && tokens.length > 1) {
    candidates.add(`${tokens.slice(1).join(" ")} bloodmoon`);
    candidates.add(tokens.slice(1).join(" "));
  }
  if (tokens[0] === "radiant" && tokens.length > 1) {
    candidates.add(`${tokens.slice(1).join(" ")} radiant`);
    candidates.add(tokens.slice(1).join(" "));
  }

  const regionalSuffixes: Record<string, string> = {
    alolan: "alola",
    galarian: "galar",
    hisuian: "hisui",
    paldean: "paldea"
  };
  if (regionalSuffixes[tokens[0]] && tokens.length > 1) {
    candidates.add(`${tokens.slice(1).join(" ")} ${regionalSuffixes[tokens[0]]}`);
    candidates.add(tokens.slice(1).join(" "));
  }

  if (tokens.includes("ogerpon")) {
    candidates.add("ogerpon");
  }

  return Array.from(candidates);
}

function getNormalizedPokemonOptionLookup(pokemonOptions: PokemonOption[]) {
  const cachedLookup = normalizedPokemonOptionLookupCache.get(pokemonOptions);
  if (cachedLookup) {
    return cachedLookup;
  }

  const normalizedLookup = new Map<string, string>();

  pokemonOptions.forEach((option) => {
    const normalizedLabel = normalizePokemonText(option.label);
    const normalizedSlug = normalizePokemonText(option.slug.replace(/-/g, " "));

    if (normalizedLabel) {
      normalizedLookup.set(normalizedLabel, option.slug);
    }
    if (normalizedSlug) {
      normalizedLookup.set(normalizedSlug, option.slug);
    }
  });

  normalizedPokemonOptionLookupCache.set(pokemonOptions, normalizedLookup);
  return normalizedLookup;
}

function getPokemonOptionsBySlug(pokemonOptions: PokemonOption[]) {
  const cachedLookup = pokemonOptionsBySlugCache.get(pokemonOptions);
  if (cachedLookup) {
    return cachedLookup;
  }

  const optionsBySlug = new Map<string, PokemonOption>();
  pokemonOptions.forEach((option) => {
    optionsBySlug.set(option.slug, option);
  });

  pokemonOptionsBySlugCache.set(pokemonOptions, optionsBySlug);
  return optionsBySlug;
}

export function resolvePokemonSpriteSlug(name: string, pokemonOptions?: PokemonOption[]) {
  const normalizedName = normalizePokemonText(name);
  if (EXPLICIT_NAME_TO_SLUG[normalizedName]) {
    return EXPLICIT_NAME_TO_SLUG[normalizedName];
  }

  if (pokemonOptions?.length) {
    const normalizedLookup = getNormalizedPokemonOptionLookup(pokemonOptions);

    for (const candidate of buildPokemonNameCandidates(name)) {
      const matchedSlug = normalizedLookup.get(candidate);
      if (matchedSlug) {
        return matchedSlug;
      }
    }
  }

  return buildLegacySpriteSlug(name);
}

export function buildPokemonSpriteUrlFromSlug(slug: string) {
  const normalizedSlug = String(slug || "").trim().toLowerCase();
  return CUSTOM_SPRITE_URLS[normalizedSlug] ?? `https://r2.limitlesstcg.net/pokemon/gen9/${normalizedSlug}.png`;
}

export function buildSelectableSpriteOptions(pokemonOptions: PokemonOption[]) {
  const existingSlugs = new Set(pokemonOptions.map((option) => option.slug));
  return [
    ...pokemonOptions,
    ...CUSTOM_SPRITE_OPTIONS.filter((option) => !existingSlugs.has(option.slug))
  ];
}

export function findPokemonOptionBySlug(slug: string, pokemonOptions?: PokemonOption[]) {
  if (!pokemonOptions?.length) {
    return undefined;
  }

  return getPokemonOptionsBySlug(pokemonOptions).get(slug);
}

export function getPokemonSpriteUrl(name: string, pokemonOptions?: PokemonOption[]) {
  const slug = resolvePokemonSpriteSlug(name, pokemonOptions);
  const matchedOption = findPokemonOptionBySlug(slug, pokemonOptions);
  if (matchedOption?.spriteUrl) {
    return matchedOption.spriteUrl;
  }

  return buildPokemonSpriteUrlFromSlug(slug);
}
