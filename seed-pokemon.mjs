import "dotenv/config";
import { syncPokemonCatalog } from "./lib/pokemon-catalog/sync.mjs";

syncPokemonCatalog({ logger: console }).catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
