import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  DISALLOWED_POKEMON_OPTION_LABELS,
  DISALLOWED_POKEMON_OPTION_SLUGS,
  getRequiredPokemonCatalogEntries,
  SEARCH_QUERY_EXPECTATIONS
} from "@/lib/pokemon-catalog/contract";
import {
  findBestPokemonSearchMatch,
  findPokemonSearchMatches
} from "@/lib/pokemon/search";
import { compactMap } from "@/lib/array";
import { buildPokemonSpriteUrlFromSlug } from "@/lib/pokemon/sprites";
import type { PokemonOption } from "@/types/index";

type PokemonCatalogRow = {
  label: string;
  slug: string;
  sprite_url: string | null;
};

type SpriteUrlFailure = {
  reason: string;
  slug: string;
  status: number | null;
  url: string;
};

const PAGE_SIZE = 1000;
const URL_CHECK_CONCURRENCY = 20;
const URL_CHECK_TIMEOUT_MS = 10000;

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildPokemonOptions(rows: PokemonCatalogRow[]): PokemonOption[] {
  return compactMap(rows, (row) =>
    row.slug && row.label
      ? {
          label: row.label,
          slug: row.slug,
          spriteUrl:
            typeof row.sprite_url === "string" && row.sprite_url
              ? row.sprite_url
              : buildPokemonSpriteUrlFromSlug(row.slug)
        }
      : null
  );
}

async function fetchAllRows(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: PokemonCatalogRow[] | null; error: unknown }>
) {
  const rows: PokemonCatalogRow[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw error;
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

function findDuplicates(values: string[]) {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return compactMap(Array.from(counts.entries()), ([value, count]) =>
    count > 1 ? { count, value } : null
  )
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function getCliFlag(flag: string) {
  return process.argv.includes(flag);
}

async function checkSpriteUrlReachable(url: string) {
  const requestInit = {
    redirect: "follow" as const,
    signal: AbortSignal.timeout(URL_CHECK_TIMEOUT_MS)
  };

  try {
    const headResponse = await fetch(url, { ...requestInit, method: "HEAD" });
    if (headResponse.ok) {
      return { ok: true, status: headResponse.status };
    }

    const getResponse = await fetch(url, { ...requestInit, method: "GET" });
    if (getResponse.ok) {
      return { ok: true, status: getResponse.status };
    }

    return { ok: false, status: getResponse.status };
  } catch (error) {
    return {
      ok: false,
      status: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

async function main() {
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const checkSpriteUrls = getCliFlag("--check-sprite-urls");

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { count: exactCount, error: countError } = await supabase
    .from("pokemon_catalog")
    .select("slug", { count: "exact", head: true });

  if (countError) {
    throw countError;
  }

  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("pokemon_catalog")
      .select("slug,label,sprite_url")
      .order("label", { ascending: true })
      .range(from, to)
  );
  const options = buildPokemonOptions(rows);
  const requiredEntries = getRequiredPokemonCatalogEntries();
  const optionBySlug = new Map(options.map((option) => [option.slug, option]));
  const disallowedSlugSet = new Set<string>(DISALLOWED_POKEMON_OPTION_SLUGS);
  const disallowedLabelSet = new Set<string>(DISALLOWED_POKEMON_OPTION_LABELS);

  const missingRequiredEntries = requiredEntries.filter((entry) => !optionBySlug.has(entry.slug));
  const requiredLabelMismatches = compactMap(requiredEntries, (entry) => {
    const mismatch = {
      actualLabel: optionBySlug.get(entry.slug)?.label ?? null,
      expectedLabel: entry.label,
      slug: entry.slug
    };

    return mismatch.actualLabel !== null && mismatch.actualLabel !== mismatch.expectedLabel
      ? mismatch
      : null;
  });

  const duplicateSlugs = findDuplicates(options.map((option) => option.slug));
  const duplicateLabels = findDuplicates(options.map((option) => option.label));
  const missingSpriteUrls = options.filter((option) => !option.spriteUrl);

  const disallowedSlugMatches = options.filter((option) => disallowedSlugSet.has(option.slug));
  const disallowedLabelMatches = options.filter((option) => disallowedLabelSet.has(option.label));

  const searchFailures = SEARCH_QUERY_EXPECTATIONS.flatMap((expectation) => {
    const matches = findPokemonSearchMatches(options, expectation.query, 20).map(
      (option) => option.slug
    );
    const bestMatch = findBestPokemonSearchMatch(options, expectation.query)?.slug ?? null;
    const failures: Array<{
      actualBestMatch: string | null;
      issue: string;
      matches: string[];
      query: string;
    }> = [];

    expectation.expectedSlugs.forEach((slug) => {
      if (!matches.includes(slug)) {
        failures.push({
          actualBestMatch: bestMatch,
          issue: `missing expected search result ${slug}`,
          matches,
          query: expectation.query
        });
      }
    });

    if (bestMatch !== expectation.bestMatch) {
      failures.push({
        actualBestMatch: bestMatch,
        issue: `expected best match ${expectation.bestMatch ?? "null"}`,
        matches,
        query: expectation.query
      });
    }

    return failures;
  });

  let spriteUrlFailures: SpriteUrlFailure[] = [];

  if (checkSpriteUrls) {
    const checkedOptions = await mapWithConcurrency(options, URL_CHECK_CONCURRENCY, async (option) => {
      const url = option.spriteUrl ?? "";

      if (!url) {
        return {
          reason: "missing sprite URL",
          slug: option.slug,
          status: null,
          url
        };
      }

      const result = await checkSpriteUrlReachable(url);
      if (result.ok) {
        return null;
      }

      return {
        reason: "reason" in result && result.reason ? result.reason : "non-success HTTP response",
        slug: option.slug,
        status: result.status,
        url
      };
    });

    spriteUrlFailures = checkedOptions.filter(
      (entry): entry is SpriteUrlFailure => entry !== null
    );
  }

  const summary = {
    checkSpriteUrls,
    duplicateLabels,
    duplicateSlugs,
    exactCount,
    missingRequiredEntries,
    missingSpriteUrls: missingSpriteUrls.map((option) => option.slug),
    optionCount: options.length,
    requiredEntryCount: requiredEntries.length,
    requiredLabelMismatches,
    searchFailures,
    spriteUrlFailureCount: spriteUrlFailures.length,
    spriteUrlFailureSample: spriteUrlFailures.slice(0, 20)
  };

  console.log(JSON.stringify(summary, null, 2));

  if ((exactCount ?? 0) !== rows.length) {
    throw new Error(`Expected ${exactCount ?? 0} rows but fetched ${rows.length}.`);
  }

  if (disallowedSlugMatches.length > 0) {
    throw new Error(
      `Catalog contains disallowed alias slugs: ${disallowedSlugMatches.map((entry) => entry.slug).join(", ")}`
    );
  }

  if (disallowedLabelMatches.length > 0) {
    throw new Error(
      `Catalog contains disallowed alias labels: ${disallowedLabelMatches.map((entry) => entry.label).join(", ")}`
    );
  }

  if (
    missingRequiredEntries.length > 0 ||
    requiredLabelMismatches.length > 0 ||
    duplicateSlugs.length > 0 ||
    duplicateLabels.length > 0 ||
    missingSpriteUrls.length > 0 ||
    searchFailures.length > 0 ||
    spriteUrlFailures.length > 0
  ) {
    throw new Error("Pokemon catalog audit failed. Review the JSON summary above.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
