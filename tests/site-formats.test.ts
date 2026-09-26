import assert from "node:assert/strict";
import test from "node:test";

import { extractSiteFormatCodes, getDefaultSiteFormat, isKnownSiteFormat } from "../lib/formats/options";

test("site format fallback defaults to the newest Standard range and recognizes current special cases", () => {
  assert.equal(getDefaultSiteFormat(), "TEF-30C");
  assert.equal(getDefaultSiteFormat(["TEF-PBL"]), "TEF-30C");
  assert.equal(getDefaultSiteFormat(["TEF-NEW"]), "TEF-NEW");
  assert(isKnownSiteFormat("TEF-30C"));
  assert(isKnownSiteFormat("TEF-PBL"));
  assert(isKnownSiteFormat("SVI-WHT/BLK"));
  assert.deepEqual(
    extractSiteFormatCodes("<li>129-226 players = 8 Swiss Rounds</li><p>TEF-30C</p><p>SVI-WHT/BLK</p>"),
    ["TEF-30C", "SVI-WHT/BLK"]
  );
});
