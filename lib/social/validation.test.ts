import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFavouriteCards, parseFriendshipForm, parseShowcaseForm, SocialValidationError } from "./validation";
import { searchCardArtPrints, validateCardArtPrints } from "./card-art";
import { isSocialSchemaUnavailable } from "./availability";
import { buildFavouriteCardArtImageUrl } from "./artwork";

test("favourite artworks preserve rank while rejecting duplicate prints, malformed identities and over-capacity", () => {
  assert.deepEqual(parseFavouriteCards([{ name: "Charizard", set: "mew", number: "0199" }, { name: "Pikachu", set: "PR-SV", number: "027" }]), [
    { name: "Charizard", set: "MEW", number: "199" }, { name: "Pikachu", set: "SVP", number: "27" }
  ]);
  const card = { name: "Charizard", set: "MEW", number: "199" };
  assert.throws(() => parseFavouriteCards([card, { ...card, set: "mew", number: "0199" }]), SocialValidationError);
  assert.throws(() => parseFavouriteCards([{ ...card, set: "https://example.com/image.png" }]), SocialValidationError);
  assert.throws(() => parseFavouriteCards([card, card, card, card]), SocialValidationError);
});

test("showcase opt-in requires a chosen trainer identity and activity remains off unless explicitly selected", () => {
  const form = new FormData();
  assert.deepEqual(parseShowcaseForm(form), { enabled: false, trainerName: "", favouritePokemonSlug: null, favouriteCards: [], shareLastLogin: false });
  form.set("enabled", "on");
  assert.throws(() => parseShowcaseForm(form), SocialValidationError);
  form.set("trainerName", "  Violet Trainer  ");
  form.set("favouritePokemonSlug", "dragapult");
  assert.equal(parseShowcaseForm(form).trainerName, "Violet Trainer");
  assert.equal(parseShowcaseForm(form).shareLastLogin, false);
  form.set("shareLastLogin", "on");
  assert.equal(parseShowcaseForm(form).shareLastLogin, true);
  form.set("favouriteCards", "invalid JSON");
  assert.throws(() => parseShowcaseForm(form), SocialValidationError);
});

test("social rollout compatibility recognizes only the missing additive profile RPC", () => {
  assert.equal(isSocialSchemaUnavailable({ code: "PGRST202", message: "Could not find the function public.get_player_profile(p_user_id) in the schema cache" }), true);
  assert.equal(isSocialSchemaUnavailable({ code: "PGRST202", message: "Could not find public.sync_current_profile()" }), false);
  assert.equal(isSocialSchemaUnavailable({ code: "42501", message: "get_player_profile access denied" }), false);
});

test("friendship commands accept only explicit transitions with a valid target identifier", () => {
  const form = new FormData();
  form.set("targetUserId", "10000000-0000-4000-8000-000000000001");
  form.set("operation", "accept");
  assert.deepEqual(parseFriendshipForm(form), { targetUserId: "10000000-0000-4000-8000-000000000001", operation: "accept" });
  form.set("operation", "makeAdmin");
  assert.throws(() => parseFriendshipForm(form), SocialValidationError);
  form.set("operation", "request");
  form.set("targetUserId", "someone@example.com");
  assert.throws(() => parseFriendshipForm(form), SocialValidationError);
});

test("artwork provider boundary verifies the exact print and canonical name and propagates failure", async () => {
  const originalFetch = globalThis.fetch;
  const card = { name: "Charizard", set: "MEW", number: "199" };
  assert.equal(buildFavouriteCardArtImageUrl("MEW", "6"), "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEW/MEW_006_R_EN_LG.png");
  assert.equal(buildFavouriteCardArtImageUrl("30C", "CC2"), "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/30C/30C_CC2_R_EN_LG.png");
  try {
    globalThis.fetch = async () => Response.json([card, card, { ...card, set: "../private" }]);
    assert.deepEqual(await searchCardArtPrints("Charizard"), [card]);
    assert.deepEqual(await validateCardArtPrints([card]), [card]);
    await assert.rejects(validateCardArtPrints([{ ...card, number: "200" }]), SocialValidationError);
    await assert.rejects(validateCardArtPrints([{ ...card, name: "Fake trainer artwork" }]), SocialValidationError);
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    await assert.rejects(searchCardArtPrints("Charizard"), /unavailable/);
    assert.deepEqual(await validateCardArtPrints([]), []);
    assert.deepEqual(await validateCardArtPrints([card], [card]), [card], "Saved prints allow privacy edits during a provider outage");
  } finally { globalThis.fetch = originalFetch; }
});
