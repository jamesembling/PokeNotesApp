const LIMITLESS_CARDS_SEARCH_URL = "https://limitlesstcg.com/cards?q=Mega+ex&show=all";
const LIMITLESS_CDN_BASE = "https://r2.limitlesstcg.net/pokemon/gen9";

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slugifyPokemonName(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildMegaSlug(label) {
  const megaMatch = normalizeWhitespace(label).match(/^Mega\s+(.+?)(?:\s+([XY]))?$/i);
  if (!megaMatch) {
    return null;
  }

  const [, baseName, suffix] = megaMatch;
  return `${slugifyPokemonName(baseName)}-mega${suffix ? `-${suffix.toLowerCase()}` : ""}`;
}

function parseSearchResultLinks(html) {
  return Array.from(
    new Set(
      [...String(html || "").matchAll(/href="(\/cards\/[A-Z0-9-]+\/\d+)"/g)].map((match) => match[1])
    )
  );
}

function parseMegaCardPage(html) {
  const nameMatch = String(html || "").match(
    /<span class="card-text-name"><a href="[^"]+">([^<]+)<\/a><\/span>/i
  );
  const stageMatch = String(html || "").match(/Pokémon\s*-\s*(Basic|Stage 1|Stage 2)/i);
  const evolvesFromMatch = String(html || "").match(
    /Evolves from\s*<a href="[^"]+">([^<]+)<\/a>/i
  );

  const rawName = decodeHtml(nameMatch?.[1] ?? "");
  const label = rawName.replace(/\s+ex$/i, "").trim();

  if (!/^Mega\s+/i.test(label)) {
    return null;
  }

  const slug = buildMegaSlug(label);
  if (!slug) {
    return null;
  }

  return {
    slug,
    label,
    evolvesFrom: slugifyPokemonName(decodeHtml(evolvesFromMatch?.[1] ?? "")),
    stage: stageMatch?.[1] ?? "Stage 1"
  };
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} ${response.statusText}: ${url}`);
  }

  return response.text();
}

export async function fetchMegaPokemonForms() {
  const searchHtml = await fetchText(LIMITLESS_CARDS_SEARCH_URL);
  const cardLinks = parseSearchResultLinks(searchHtml);
  const forms = new Map();

  for (const relativeLink of cardLinks) {
    const pageHtml = await fetchText(`https://limitlesstcg.com${relativeLink}`);
    const form = parseMegaCardPage(pageHtml);

    if (!form || !form.evolvesFrom) {
      continue;
    }

    forms.set(form.slug, form);
  }

  return Array.from(forms.values())
    .map((form) => ({
      slug: form.slug,
      label: form.label,
      national_dex: null,
      stage: form.stage,
      evolves_from: form.evolvesFrom,
      sprite_url: `${LIMITLESS_CDN_BASE}/${form.slug}.png`,
      name_de: null,
      name_es: null,
      name_fr: null,
      name_it: null,
      name_pt_br: null,
      last_synced_at: new Date().toISOString()
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
