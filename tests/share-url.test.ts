import assert from "node:assert/strict";
import test from "node:test";
import { buildSharedLogPath, buildSharedLogUrl } from "@/lib/server/share-url";

test("shared log URLs use the compact route", () => {
  assert.equal(buildSharedLogPath("share_token-1"), "/s/share_token-1");
  assert.equal(
    buildSharedLogUrl("https://poke-notes-app.vercel.app", "share_token-1"),
    "https://poke-notes-app.vercel.app/s/share_token-1"
  );
});

