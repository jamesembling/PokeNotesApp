import assert from "node:assert/strict";
import test from "node:test";
import {
  searchUkPlayStores,
  UK_PLAY_STORE_SNAPSHOT
} from "../lib/locations/play-stores";

test("UK Play! Store suggestions rank names and return at most ten results", () => {
  assert.equal(UK_PLAY_STORE_SNAPSHOT.count, 393);

  const namedResults = searchUkPlayStores("bad moon");
  assert.deepEqual(
    namedResults.map(({ name }) => name),
    ["BAD MOON CAFE HOLLOWAY ROAD", "BAD MOON CAFE LTD."]
  );
  assert.match(namedResults[0].address, /LONDON N7 8HS/);
  assert.equal(namedResults[0].leagueId, "L26035266");

  const cavern = searchUkPlayStores("the cavern")[0];
  assert.equal(cavern.city, "GLOUCESTER");
  assert.equal(cavern.label, "THE CAVERN, GLOUCESTER");

  const storeAlreadyNamedForItsCity = searchUkPlayStores("aj-tcg carlisle")[0];
  assert.equal(storeAlreadyNamedForItsCity.label, "AJ-TCG CARLISLE");

  const broadResults = searchUkPlayStores("the");
  assert.equal(broadResults.length, 10);

  assert.equal(searchUkPlayStores("not a real play store").length, 0);
});
