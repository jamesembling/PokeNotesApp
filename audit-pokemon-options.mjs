import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV_VARS = ["NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_KEY"];
const PAGE_SIZE = 1000;

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.NEW_SUPABASE_URL, process.env.NEW_SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fetchAllRows(fetchPage, pageSize = PAGE_SIZE) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw error;
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function main() {
  const { count: exactCount, error: countError } = await supabase
    .from("pokemon_catalog")
    .select("slug", { count: "exact", head: true });

  if (countError) {
    throw countError;
  }

  const { data: limitedRows, error: limitedError } = await supabase
    .from("pokemon_catalog")
    .select("slug,label")
    .order("label", { ascending: true });

  if (limitedError) {
    throw limitedError;
  }

  const paginatedRows = await fetchAllRows((from, to) =>
    supabase
      .from("pokemon_catalog")
      .select("slug,label")
      .order("label", { ascending: true })
      .range(from, to)
  );

  const limitedSlugs = new Set((limitedRows ?? []).map((row) => row.slug));
  const missingFromLimited = paginatedRows.filter((row) => !limitedSlugs.has(row.slug));
  const mustInclude = ["zacian", "zekrom"];
  const missingRequired = mustInclude.filter(
    (slug) => !paginatedRows.some((row) => row.slug === slug)
  );

  console.log(
    JSON.stringify(
      {
        exactCount,
        limitedCount: limitedRows?.length ?? 0,
        paginatedCount: paginatedRows.length,
        missingFromLimitedCount: missingFromLimited.length,
        missingFromLimitedSample: missingFromLimited.slice(0, 20).map((row) => row.slug),
        missingRequired
      },
      null,
      2
    )
  );

  if ((exactCount ?? 0) !== paginatedRows.length) {
    throw new Error(
      `Paginated fetch returned ${paginatedRows.length} rows, expected ${exactCount ?? 0}.`
    );
  }

  if (missingRequired.length > 0) {
    throw new Error(`Required Pokemon missing from paginated list: ${missingRequired.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(`Pokemon options audit failed: ${error.message}`);
  process.exit(1);
});
