import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("production deployments explicitly use Fluid Compute in the Dublin region", () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "vercel.json"), "utf8")
  ) as {
    $schema?: string;
    fluid?: boolean;
    regions?: string[];
  };

  assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json");
  assert.equal(config.fluid, true);
  assert.deepEqual(config.regions, ["dub1"]);
});
