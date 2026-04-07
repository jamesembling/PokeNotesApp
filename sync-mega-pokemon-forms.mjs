import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fetchMegaPokemonForms } from "./lib/pokemon-catalog/mega-forms.mjs";

const REQUIRED_ENV_VARS = ["NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_KEY"];

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

async function main() {
  const rows = await fetchMegaPokemonForms();
  const { error } = await supabase.from("pokemon_catalog").upsert(rows, { onConflict: "slug" });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`Synced ${rows.length} Mega Pokemon forms to pokemon_catalog.`);
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
