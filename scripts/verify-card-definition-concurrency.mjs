#!/usr/bin/env node
// This check has no hosted target or credential input.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

assert.equal(process.argv.length, 2, "This fixed local check accepts no target overrides.");
const container = "supabase_db_pokenotes-e2e";
const port = execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8", timeout: 10000 });
assert.ok(port.split("\n").some((line) => /:54322$/.test(line)), "Refusing a database outside the fixed local E2E stack.");
const args = ["exec", "-i", "-e", "PGOPTIONS=-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=15000", container, "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1", "-c"];
const sql = (query) => execFileSync("docker", [...args, query], { encoding: "utf8", timeout: 20000 }).trim();
const generation = randomUUID();
const application = `catalog_writer_${generation}`;
const previous = sql("select generation_id from public.card_definition_active");
assert.ok(!previous || /^[0-9a-f-]{36}$/.test(previous));
let writer;
let writerDone;
let publisherDone;
let publisher;
let failure;
const completion = (child) => new Promise((resolve) => {
  const deadline = setTimeout(() => { child.kill("SIGKILL"); resolve(false); }, 25000);
  const finish = (passed) => { clearTimeout(deadline); resolve(passed); };
  child.on("error", () => finish(false));
  child.on("exit", (code) => finish(code === 0));
});
const until = async (ready) => {
  const deadline = Date.now() + 10000;
  while (!ready()) {
    assert.ok(Date.now() < deadline, "Concurrent session did not reach its required lock state.");
    await delay(50);
  }
};
try {
  sql(`set role service_role; insert into public.card_definition_generations (id,source,expected_count,source_manifest_hash,source_coverage)
    values ('${generation}','tcgdex',1,'synthetic-concurrency','{}')`);
  writer = spawn("docker", args.slice(0, -1), { stdio: ["pipe", "pipe", "pipe"] });
  // A failed Docker/psql child can close stdin before the controller releases
  // its transaction. Completion owns that failure; an EPIPE must not skip cleanup.
  writer.stdin.on("error", () => {});
  writerDone = completion(writer);
  let output = "";
  writer.stdout.on("data", (chunk) => { output += chunk.toString(); });
  writer.stdin.write(`begin; set local role service_role; set local application_name='${application}';
    insert into public.card_definition_catalog values ('${generation}','synthetic-concurrent','synthetic','{"sourceCardId":"synthetic-concurrent"}');
    select 'writer_locked';\n`);
  // Observe the real writer holding its parent lock before starting publication.
  await until(() => output.includes("writer_locked"));
  const started = Date.now();
  const publisherApplication = `catalog_publish_${generation}`;
  publisher = spawn("docker", [...args, `set application_name='${publisherApplication}'; set role service_role;
    select public.publish_card_definition_generation('${generation}')`], { stdio: ["ignore", "pipe", "pipe"] });
  publisherDone = completion(publisher);
  await until(() => sql(`select count(*) from pg_stat_activity where application_name='${publisherApplication}' and wait_event_type='Lock'`) === "1");
  writer.stdin.end("commit;\n");
  assert.equal(await writerDone, true, "Synthetic staging writer failed.");
  assert.equal(await publisherDone, true, "Publication did not succeed after the writer committed.");
  const elapsed = Date.now() - started;
  assert.equal(sql("select generation_id from public.card_definition_active"), generation);
  assert.equal(sql(`select count(*) from public.card_definition_catalog where generation_id='${generation}'`), "1");
  console.log(`Catalogue staging/publication concurrency passed (${elapsed} ms waiting for the real writer).`);
} catch (error) {
  failure = error;
  throw error;
} finally {
  if (writer && !writer.stdin.destroyed && !writer.stdin.writableEnded) writer.stdin.end("rollback;\n");
  if (writerDone) await writerDone;
  if (publisherDone) await publisherDone;
  try { sql(`begin; set local role service_role;
    ${previous ? `update public.card_definition_active set generation_id='${previous}' where singleton=true;` : `delete from public.card_definition_active where generation_id='${generation}';`}
    delete from public.card_definition_generations where id='${generation}'; commit;`);
  } catch (error) {
    if (!failure) throw error;
    console.error("Synthetic catalogue cleanup failed after the original verification failure.");
  }
}
