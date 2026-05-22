import assert from "node:assert/strict";
import test from "node:test";

import { SITE_FORMAT_OPTIONS, getDefaultSiteFormat, isKnownSiteFormat } from "../lib/formats/options";

test("site format fallback defaults to the newest Standard set range", () => {
  assert.equal(getDefaultSiteFormat(), "TEF-CRI");
  assert.equal(SITE_FORMAT_OPTIONS[0], "TEF-CRI");
  assert(isKnownSiteFormat("TEF-CRI"));
});

test("site format fallback keeps current special-case set ranges", () => {
  assert(isKnownSiteFormat("SVI-WHT/BLK"));
});
