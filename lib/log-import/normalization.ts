import type { Language } from "@/types/index";
import type { PokemonCatalogRow } from "@/lib/log-import/types";

export function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9'+-]+/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWhitespace(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function stripTrainerPrefix(value: string) {
  const normalized = normalizeWhitespace(value);
  return normalized.replace(/^[A-Za-z0-9 .-]+'s\s+/i, "").trim();
}

function pushVariant(target: Set<string>, value: string) {
  const normalized = normalizeText(stripTrainerPrefix(value));
  if (normalized) {
    target.add(normalized);
  }
}

function buildMegaVariants(label: string) {
  const variants = new Set<string>();
  const megaPrefix = label.match(/^Mega\s+(.+)$/i);
  if (megaPrefix) {
    pushVariant(variants, `${megaPrefix[1]} Mega`);
  }

  const megaSuffix = label.match(/^(.+)\s+Mega(?:\s+([XY]))?$/i);
  if (megaSuffix) {
    const [, base, form] = megaSuffix;
    pushVariant(variants, `Mega ${base}${form ? ` ${form}` : ""}`);
  }

  return Array.from(variants);
}

function buildOriginVariants(label: string) {
  const variants = new Set<string>();
  const originPrefix = label.match(/^Origin Forme\s+(.+)$/i);
  if (originPrefix) {
    pushVariant(variants, `${originPrefix[1]} Origin`);
    pushVariant(variants, `${originPrefix[1]} Origin Forme`);
  }

  return Array.from(variants);
}

export function buildPokemonNameVariants(
  row: PokemonCatalogRow,
  language: Language | "all" = "all"
) {
  const variants = new Set<string>();
  const localizedByLanguage: Record<Language, string | null> = {
    en: row.label,
    de: row.name_de,
    es: row.name_es,
    fr: row.name_fr,
    it: row.name_it,
    "pt-br": row.name_pt_br
  };

  const names =
    language === "all"
      ? [row.label, row.name_de, row.name_es, row.name_fr, row.name_it, row.name_pt_br]
      : [localizedByLanguage[language] ?? row.label, row.label];

  names
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .forEach((value) => {
      pushVariant(variants, value);
      buildMegaVariants(value).forEach((variant) => pushVariant(variants, variant));
      buildOriginVariants(value).forEach((variant) => pushVariant(variants, variant));
    });

  if (row.slug.endsWith("-hisui")) {
    const base = row.label.replace(/^Hisuian\s+/i, "");
    if (base) {
      pushVariant(variants, `${base} Hisui`);
    }
  }

  return Array.from(variants);
}
