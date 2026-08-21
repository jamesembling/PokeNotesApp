import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20260821003055_first_class_deck_lists.sql");
const schema = read("schema.sql");
const deployOrder = read("docs/deck-list-first-class-deploy-order.md");
const migrationRelease = read("docs/migration-release.md");

const checks = [
  ["migration defines account-scoped Deck List identity", /add constraint deck_lists_pkey primary key \(user_id, id\)/i.test(migration)],
  ["migration defines per-account creation idempotency", /deck_lists_user_creation_key_unique[\s\S]*on public\.deck_lists \(user_id, creation_key\)/i.test(migration)],
  ["migration defines optional account-owned strategy association", /deck_lists_owner_deck_fkey[\s\S]*foreign key \(user_id, deck_id\)[\s\S]*references public\.decks \(user_id, id\)[\s\S]*on delete set null/i.test(migration)],
  ["migration retains legacy references without incompatible list FKs", /do not add list foreign keys during the ADR 0001 compatibility/i.test(migration) && /compatibility[\s\S]{0,80}window/i.test(migration)],
  ["migration installs the ownership/reference helper and RLS wiring", /can_use_deck_list_reference/i.test(migration) && /Users can insert own logs/i.test(migration)],
  ["migration installs atomic create/update and association RPCs", /commit_first_class_deck_list/i.test(migration) && /set_deck_list_association/i.test(migration)],
  ["migration installs safe delete cleanup", /remove_deleted_deck_list_legacy_copy/i.test(migration) && /delete_first_class_deck_list/i.test(migration)],
  ["migration carries canonical visual ordering", /sorted_cards_version/i.test(migration) && /position integer/i.test(migration)],
  ["fresh schema contains the migration-aligned contract", /-- Final first-class Deck List state/i.test(schema) && /commit_first_class_deck_list/i.test(schema) && /can_use_deck_list_reference/i.test(schema)],
  ["release order is migration-first and application-second", /migration-first/i.test(deployOrder) && /application second/i.test(deployOrder)],
  ["release order names observable RLS and ownership gates", /RLS/i.test(deployOrder) && /ownership/i.test(deployOrder)],
  ["release order names relational/legacy parity and visual ordering", /relational/i.test(deployOrder) && /legacy/i.test(deployOrder) && /visual ordering/i.test(deployOrder)],
  ["release order names rollback safety and the production boundary", /rollback/i.test(deployOrder) && /production/i.test(deployOrder) && /manual/i.test(migrationRelease)]
];

let failed = false;
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
  failed ||= !passed;
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Deck List repository release contract: PASS");
}
