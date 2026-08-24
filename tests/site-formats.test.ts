import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultSiteFormat, isKnownSiteFormat } from "../lib/formats/options";

test("site format fallback defaults to the newest Standard range and recognizes current special cases", () => {
  assert.equal(getDefaultSiteFormat(), "TEF-PBL");
  assert(isKnownSiteFormat("TEF-PBL"));
  assert(isKnownSiteFormat("SVI-WHT/BLK"));
});
