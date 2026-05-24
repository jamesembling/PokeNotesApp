import "dotenv/config";
import { syncCardEffectCatalog } from "./lib/card-effect-catalog/sync.mjs";

syncCardEffectCatalog()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
