import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLimitlessSetCode } from "@/lib/deck-lists/limitless";
import { buildDeckListCardImageUrl, buildDeckListCardUrl } from "@/lib/deck-lists/render";
import { buildLimitlessCardUrl, buildCardImageUrlFromValues } from "@/lib/probability-calculator/index";

test("normalizes Scarlet & Violet promo export codes to Limitless promo codes", () => {
  assert.equal(normalizeLimitlessSetCode("PR-SV"), "SVP");
});

test("normalizes other common promo export aliases used in decklists", () => {
  assert.equal(normalizeLimitlessSetCode("pr-sw"), "SP");
  assert.equal(normalizeLimitlessSetCode("PR-SM"), "SMP");
  assert.equal(normalizeLimitlessSetCode("PR-XY"), "XYP");
});

test("builds deck visual URLs with normalized Limitless set codes", () => {
  assert.equal(
    buildDeckListCardUrl("PR-SV", "203"),
    "https://limitlesstcg.com/cards/SVP/203"
  );
  assert.equal(
    buildDeckListCardImageUrl("PR-SV", "203"),
    "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/SVP/SVP_203_R_EN_SM.png"
  );
});

test("builds calculator Limitless URLs with normalized Limitless set codes", () => {
  assert.equal(
    buildLimitlessCardUrl({
      set: "PR-SV",
      number: "203"
    }),
    "https://limitlesstcg.com/cards/SVP/203"
  );
  assert.equal(
    buildCardImageUrlFromValues("PR-SV", "203", "XS", true),
    "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/SVP/SVP_203_R_EN_XS.png"
  );
});
