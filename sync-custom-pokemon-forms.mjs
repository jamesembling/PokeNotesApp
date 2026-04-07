import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import customPokemonForms from "./lib/pokemon-catalog/custom-forms.json" with { type: "json" };

const REQUIRED_ENV_VARS = ["NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_KEY"];
const LIMITLESS_CDN_BASE = "https://r2.limitlesstcg.net/pokemon/gen9";

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.NEW_SUPABASE_URL,
  process.env.NEW_SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function buildRows() {
  const timestamp = new Date().toISOString();

  return customPokemonForms.map((form) => ({
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
    last_synced_at: timestamp
  }));
}

async function main() {
  const rows = buildRows();
  const { error } = await supabase.from("pokemon_catalog").upsert(rows, { onConflict: "slug" });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`Synced ${rows.length} custom Pokemon forms to pokemon_catalog.`);
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
