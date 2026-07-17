import "dotenv/config";
import { syncCardEffectCatalog } from "./lib/card-effect-catalog/sync.mjs";

syncCardEffectCatalog({ setId: process.env.POKEMON_TCG_SET_ID })
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
