import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  extractSiteFormatCodes,
  getDefaultSiteFormat,
  isKnownSiteFormat,
  SITE_FORMAT_OPTIONS
} from "../lib/formats/options";

test("site format fallback defaults to the newest Standard range and recognizes current special cases", () => {
  assert.equal(getDefaultSiteFormat(), "TEF-DLR");
  assert.equal(getDefaultSiteFormat(["TEF-30C"]), "TEF-DLR");
  assert.equal(getDefaultSiteFormat(["TEF-PBL"]), "TEF-DLR");
  assert.equal(getDefaultSiteFormat(["TEF-NEW"]), "TEF-NEW");
  assert(isKnownSiteFormat("TEF-30C"));
  assert(isKnownSiteFormat("TEF-DLR"));
  assert(isKnownSiteFormat("TEF-PBL"));
  assert(isKnownSiteFormat("SVI-WHT/BLK"));
  assert.deepEqual(
    extractSiteFormatCodes(
      "<li>129-226 players = 8 Swiss Rounds</li><p>TEF-30C</p><p>SVI-WHT/BLK</p>"
    ),
    ["TEF-30C", "SVI-WHT/BLK"]
  );
});

function readTournamentFormatAllowlist(sql: string) {
  const definitions = sql
    .split("create or replace function public.commit_tournament_metadata(")
    .slice(1);
  const list = definitions.at(-1)?.match(/v_format not in \(([^)]*)\)/)?.[1];
  assert(list, "commit_tournament_metadata must declare a Tournament format allowlist");
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
}

test("every site format can be saved on a Tournament by the database", () => {
  const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
  const latestMigration = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
    .filter((sql) => sql.includes("create or replace function public.commit_tournament_metadata("))
    .at(-1);
  assert(latestMigration, "a migration must define commit_tournament_metadata");
  const siteFormats = [...SITE_FORMAT_OPTIONS].sort();

  assert.deepEqual(readTournamentFormatAllowlist(latestMigration), siteFormats);
  assert.deepEqual(
    readTournamentFormatAllowlist(readFileSync(new URL("../schema.sql", import.meta.url), "utf8")),
    siteFormats
  );
});
