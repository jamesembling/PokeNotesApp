#!/usr/bin/env node
/**
 * Rehearses supabase/migrations/20261017230637_festival_lead_damage_repair.sql against
 * the disposable local E2E database. Only the reviewed rows block is replaced with
 * synthetic rows; every guard, lock and update statement runs exactly as committed.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const container = "supabase_db_pokenotes-e2e";
const migration = readFileSync(
  new URL("../supabase/migrations/20261017230637_festival_lead_damage_repair.sql", import.meta.url),
  "utf8"
);
const [head, rest] = migration.split("-- repair-rows:begin");
const [, tail] = rest.split("-- repair-rows:end");
assert.ok(head && tail, "The migration must keep its repair-rows markers.");

const users = ["44444444-4444-4444-8444-444444444441", "44444444-4444-4444-8444-444444444442"];
const logs = [
  { id: "festival-rehearsal-a1", user: users[0], self: 300, opponent: 120, addSelf: 200, addOpponent: 0 },
  { id: "festival-rehearsal-a2", user: users[0], self: 80, opponent: 410, addSelf: 0, addOpponent: 410 },
  { id: "festival-rehearsal-b1", user: users[1], self: 270, opponent: 220, addSelf: 120, addOpponent: 440 }
];
const idList = logs.map((log) => `'${log.id}'`).join(", ");
const userList = users.map((user) => `'${user}'`).join(", ");

function psql(sql) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"],
    { input: sql, encoding: "utf8" }
  );
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

function query(sql) {
  const result = psql(sql);
  assert.ok(result.ok, result.err);
  return result.out ? result.out.split("\n").map((line) => line.split("\t")) : [];
}

function rowsBlock(rows) {
  return `\n${rows
    .map(
      (row) =>
        `      ('${row.id}', '${row.user}', '${row.updatedAt}', ${row.oldSelf}, ${row.oldOpponent}, ${row.newSelf}, ${row.newOpponent},\n` +
        `       '${row.rawSha}',\n       '${row.sectionsSha}')`
    )
    .join(",\n")}\n      `;
}

function variant(rows) {
  return `${head}-- repair-rows:begin${rowsBlock(rows)}-- repair-rows:end${tail}`;
}

function currentRows({ forward = true, tamper = {} } = {}) {
  const stored = query(`
    select id, user_id, updated_at::text, self_attack_damage, opponent_attack_damage,
      encode(sha256(convert_to(coalesce(raw_log, ''), 'UTF8')), 'hex'),
      encode(sha256(convert_to(sections::text, 'UTF8')), 'hex')
    from public.logs where id in (${idList}) order by id;`);
  return stored.map(([id, user, updatedAt, self, opponent, rawSha, sectionsSha]) => {
    const log = logs.find((entry) => entry.id === id);
    const original = { self: log.self, opponent: log.opponent };
    const repaired = { self: log.self + log.addSelf, opponent: log.opponent + log.addOpponent };
    const from = forward ? original : repaired;
    const to = forward ? repaired : original;
    return {
      id, user, updatedAt, rawSha, sectionsSha,
      oldSelf: from.self + (tamper[id] ?? 0), oldOpponent: from.opponent,
      newSelf: to.self, newOpponent: to.opponent,
      storedSelf: Number(self), storedOpponent: Number(opponent)
    };
  });
}

function damage() {
  return Object.fromEntries(
    query(`select id, self_attack_damage, opponent_attack_damage from public.logs where id in (${idList}) order by id;`)
      .map(([id, self, opponent]) => [id, [Number(self), Number(opponent)]])
  );
}

function untouchedColumnsDigest() {
  return query(`
    select id, md5((to_jsonb(log) - 'self_attack_damage' - 'opponent_attack_damage' - 'updated_at')::text)
    from public.logs as log where id in (${idList}) order by id;`).map((row) => row.join(":")).join(",");
}

function stats() {
  return Object.fromEntries(
    query(`
      select s.user_id, s.attack_damage, s.opponent_attack_damage, s.tracked_damage,
        (select coalesce(sum(self_attack_damage), 0) from public.logs l where l.user_id = s.user_id),
        (select coalesce(sum(opponent_attack_damage), 0) from public.logs l where l.user_id = s.user_id)
      from public.user_log_stats s where s.user_id in (${userList}) order by 1;`)
      .map(([user, attack, opponent, tracked, logSelf, logOpponent]) => [user, { attack: Number(attack), opponent: Number(opponent), tracked: Number(tracked), logSelf: Number(logSelf), logOpponent: Number(logOpponent) }])
  );
}

function cleanup() {
  psql(`
    delete from public.logs where id in (${idList});
    delete from public.user_log_stats where user_id in (${userList});
    delete from public.profiles where id in (${userList});
    delete from auth.users where id in (${userList});`);
}

function step(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

cleanup();
try {
  query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', '${users[0]}', 'authenticated', 'authenticated', 'festival-rehearsal-a@pokenotes.local', '', now(), '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', '${users[1]}', 'authenticated', 'authenticated', 'festival-rehearsal-b@pokenotes.local', '', now(), '{}', '{}', now(), now());
    insert into public.logs (id, user_id, date, result, coin_toss_won, self_attack_damage, opponent_attack_damage,
      self_mulligans, self_prizes_taken, opponent_prizes_taken, raw_log, sections)
    values ${logs
      .map(
        (log) =>
          `('${log.id}', '${log.user}', current_date, 'Win', true, ${log.self}, ${log.opponent}, 0, 6, 2,
            'Synthetic rehearsal log ${log.id}.', '[{"title": "Setup", "player": "", "actions": []}]'::jsonb)`
      )
      .join(",\n")};`);

  const original = damage();
  const originalStats = stats();
  const untouched = untouchedColumnsDigest();
  for (const user of users) {
    assert.equal(originalStats[user].attack, originalStats[user].logSelf, "baseline stats agree with logs");
  }

  step("the committed rows leave a database without candidates unchanged", () => {
    const result = psql(migration);
    assert.ok(result.ok, result.err);
    assert.match(result.err, /no candidate rows present/);
    assert.deepEqual(damage(), original);
  });

  step("a single mismatched guard aborts every row", () => {
    const result = psql(variant(currentRows({ tamper: { [logs[1].id]: 10 } })));
    assert.equal(result.ok, false);
    assert.match(result.err, /3 of 3 rows present, 2 match/);
    assert.deepEqual(damage(), original);
  });

  step("a reviewed row missing from the database aborts every row", () => {
    const rows = currentRows();
    rows.push({ ...rows[0], id: "festival-rehearsal-missing" });
    const result = psql(variant(rows));
    assert.equal(result.ok, false);
    assert.match(result.err, /3 of 4 rows present/);
    assert.deepEqual(damage(), original);
  });

  step("an edit committed while the repair waits on its row lock aborts the repair", () => {
    const rows = currentRows();
    spawn(
      "docker",
      [
        "exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
        `begin; update public.logs set match_notes = 'concurrent edit' where id = '${logs[0].id}'; select pg_sleep(4); commit;`
      ],
      { stdio: "ignore" }
    );
    const lockDeadline = Date.now() + 15000;
    while (!query(`select 1 from pg_stat_activity where state = 'active' and query like '%pg_sleep(4)%' and query not like '%pg_stat_activity%';`).length) {
      assert.ok(Date.now() < lockDeadline, "the concurrent editor took its row lock");
      spawnSync("sleep", ["0.2"]);
    }
    const started = Date.now();
    const result = psql(variant(rows));
    assert.ok(Date.now() - started >= 1000, "the repair waited for the editor's row lock");
    assert.equal(result.ok, false);
    assert.match(result.err, /3 of 3 rows present, 2 match/);
    assert.deepEqual(damage(), original);
    assert.deepEqual(query(`select match_notes from public.logs where id = '${logs[0].id}';`), [["concurrent edit"]]);
    query(`update public.logs set match_notes = null where id = '${logs[0].id}';`);
  });

  step("a matching repair changes only both damage columns and the account statistics", () => {
    const result = psql(variant(currentRows()));
    assert.ok(result.ok, result.err);
    const repaired = damage();
    for (const log of logs) {
      assert.deepEqual(repaired[log.id], [log.self + log.addSelf, log.opponent + log.addOpponent]);
    }
    assert.equal(untouchedColumnsDigest(), untouched);
    const after = stats();
    for (const user of users) {
      const owned = logs.filter((log) => log.user === user);
      const addSelf = owned.reduce((total, log) => total + log.addSelf, 0);
      const addOpponent = owned.reduce((total, log) => total + log.addOpponent, 0);
      assert.equal(after[user].attack, originalStats[user].attack + addSelf);
      assert.equal(after[user].opponent, originalStats[user].opponent + addOpponent);
      assert.equal(after[user].tracked, originalStats[user].tracked + addSelf + addOpponent);
      assert.equal(after[user].attack, after[user].logSelf, "incremental stats agree with logs");
      assert.equal(after[user].opponent, after[user].logOpponent, "incremental stats agree with logs");
    }
  });

  step("repeating the repair produces no further delta", () => {
    const before = damage();
    const beforeStats = stats();
    const rows = currentRows().map((row) => ({ ...row, updatedAt: "2000-01-01 00:00:00+00" }));
    const result = psql(variant(rows));
    assert.ok(result.ok, result.err);
    assert.match(result.err, /already corrected/);
    assert.deepEqual(damage(), before);
    assert.deepEqual(stats(), beforeStats);
  });

  step("a swapped forward repair restores the original values and statistics", () => {
    const result = psql(variant(currentRows({ forward: false })));
    assert.ok(result.ok, result.err);
    assert.deepEqual(damage(), original);
    const restored = stats();
    for (const user of users) {
      assert.equal(restored[user].attack, originalStats[user].attack);
      assert.equal(restored[user].opponent, originalStats[user].opponent);
      assert.equal(restored[user].tracked, originalStats[user].tracked);
    }
    assert.equal(untouchedColumnsDigest(), untouched);
  });

  console.log("Festival Lead damage repair rehearsal passed.");
} finally {
  cleanup();
}
