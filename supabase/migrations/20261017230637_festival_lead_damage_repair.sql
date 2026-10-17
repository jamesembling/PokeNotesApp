-- Correct saved Battle Log attack damage that predates the Festival Lead parser
-- fix (docs/preserved-facts-repair.md). The 38 rows were reviewed against their
-- raw logs on 17 October 2026; three also gain recorded Trifrost bench damage.
--
-- Every row is guarded by owner, row version, current damage and digests of its
-- raw log and saved sections. A database without these rows is left unchanged; any
-- partial or mismatched set aborts the whole repair. Only the two damage columns
-- are written. The statement-level log trigger applies the user_log_stats deltas.

-- Contention on a candidate row or an account statistics lock fails promptly.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $repair$
declare
  v_expected integer;
  v_present integer;
  v_matching integer;
  v_repaired integer;
  v_updated integer;
begin
  create temporary table festival_damage_repair (
    id text primary key,
    user_id uuid not null,
    expected_updated_at timestamptz not null,
    old_self_damage integer not null,
    old_opponent_damage integer not null,
    new_self_damage integer not null,
    new_opponent_damage integer not null,
    raw_log_sha256 text not null,
    sections_sha256 text not null
  );

  insert into festival_damage_repair values
      -- repair-rows:begin
      ('0185bcee-52d9-45a8-8040-7942e0d96563', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-14 22:32:01.446895+00', 210, 180, 210, 360,
       '13f49411a8aad085965bc837c9d3e8e7c58ad2649b98205f68c1044d70fd7426',
       '20a7285e542060f8017adaba9ec8233d341d99a76f4a8f9a502396e2ed3d01cc'),
      ('02440782-ba7d-4268-a741-75543fc2de4c', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-04-28 11:37:00.629668+00', 290, 830, 570, 830,
       '3a44ea0b65368c20e5ecf8722af99a8f8e046baff0d612102c0b00b1eb553ff8',
       '759d3b9f3b875e5107d4322447565d7794dad6e63e3f42ff0667be04d98ba246'),
      ('04d8aa93-7893-4aad-850a-15f4f5a45eb7', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-06-03 09:28:30.518262+00', 50, 210, 50, 410,
       'fa66a8965a0e64aab81e32d25911f6c268bd136ef89fec0d3c9a91c72d373ffa',
       '3e630e025a1b28d4da3190bcb88f2ce13500880cd8484f1bf22dbf5b6f513c8e'),
      ('06065758-1f89-485e-921e-6f97cc80e20f', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-09-14 20:19:59.662218+00', 550, 60, 550, 120,
       'e85ac02eb8e6fdaf361d1fdcb78331e231eb121567b0a888c5bae7248297b72a',
       '328391bfe5fad9b5ea340b60dad8a123850a415c84a5a3a2032d4dfe5989d4e4'),
      ('077a8ae7-ab06-4dd1-bdcb-08c843e86bbc', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-28 17:35:43.050954+00', 400, 240, 400, 480,
       'eee3c9ac15cd0294aaa9626b46109e4893e2afc88eee7a4c15b61200e013d6a7',
       'fb6560ee02712524448595940e108994dfa8e2b6b1ef1831935874e71638e5e4'),
      ('0fdbe635-368e-4fd9-a58d-0e4eb01e8249', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-28 20:10:26.607227+00', 160, 320, 160, 420,
       'e991786e2ad50ddd38c6863a32363bf5f429d19eb211269ac75c51a341569b80',
       '1f4f69eda636300ea9febf74fe449fbcfc1628b9c32e2f996a468d1891a53919'),
      ('195a3db4-0e07-4654-811a-24e46bd9ebeb', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-10-06 14:49:50.574437+00', 730, 610, 730, 1250,
       '201747ed5859bddb3044444adf5e729ea915f171da1ada0c00e0cf7875648086',
       '0d7ed844920b3bb854e7cee183d6907b65a730ad0b2c199aea469fa6b8a9dd5e'),
      ('34c91b6d-abd1-48fd-bb42-64f36d51813b', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-06-04 19:16:25.259353+00', 10, 60, 10, 120,
       '3bbeebe59e938670602b46dff2ff9aeedf5adf990b79856f2550bb5434109a9b',
       'd4d60ddc3d683e40011a3780cc0261078661ea26fb96df02e879c7679eb83ee4'),
      ('3ee0f572-1e6c-4927-9db5-4a6d5cc0e45b', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-04-28 08:53:32.610998+00', 240, 100, 360, 100,
       '9aef81a541329dc1cac79e0163ba2ccfeb38599bdd3920fa107ac4bf1244415d',
       'f928dd2ff9fa4b1b64f741d10b6105ab1571df5ca312ea882fed984c1728c563'),
      ('4cc0e1aa-7775-47f0-b2fe-26ba576da70e', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-10-02 22:14:57.52071+00', 630, 330, 630, 560,
       '740d71e4a47c778d5602bc6b287b09a432cbf89321210f30faeccada114a62da',
       '6ea9ce89d9c7c002a5c47fb02a8325fa6a692cc4315275842253c603ea5fbcc4'),
      ('6f5d9751-1e57-46c5-99dd-b5794e1edb1b', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-28 17:35:43.050954+00', 680, 220, 680, 320,
       '5b69007da8d9bb0a0c6fe6b2988c2dcdc9088f637f9005313496cc7af2d5c3cc',
       'c014560dfab4317ab0b28d6a9b9dfbf927aae31228584c8691301b9fae8d2284'),
      ('76da5cda-a292-4d2a-8ee2-968e79eea78c', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-05-21 23:47:06.912607+00', 180, 760, 320, 760,
       'b7d14059d9d0ac93501a008766b2ff5ab248e7da2e35ee2a49be693e375a4c7e',
       'b05c9e24daf94090bd298e95d31aab5760d9b51259953fa22eedf087da931263'),
      ('9aba6a1b-0e35-4775-aabd-d6fc8c9e28ac', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-09-14 15:04:25.307387+00', 80, 200, 80, 400,
       'a69802d3990d07cbcf05c7ec7e0b60e50ba59880b8733ce16663f5f9f7b1f559',
       '6e28f0bd24dbb2f7ebcb6894aa8c69300fc442f59e4694eb7cb5156bf64e8a64'),
      ('9f2c0b63-e528-4044-8e77-98a32e4769b2', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-04-27 13:41:45.459013+00', 290, 240, 530, 240,
       '0442c42ef05bbaecc205155146d80f525161cb6245d9fe19857915264b3e333b',
       '5568c26e3d98abe2189bbde82d3aceaaadebe427256b00f2ac340917e1d4f506'),
      ('a3ac171e-a390-4d3b-be03-28238557e5bf', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-28 17:35:43.050954+00', 720, 450, 720, 900,
       '34068fe467a7988bbdcc18bdf19cc0c3e726a57dd6a0b652c268e95d30352f2a',
       '6f35bf1222d8b5de384ffafdae3f6b36215490fa18cd384202bc75358d80ac9e'),
      ('adecb494-61d1-4a6f-b7dd-19a6d01e1293', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-09-09 09:17:04.900646+00', 150, 260, 150, 500,
       'f98582176957af40723a88bc7b875bc1d727b44916ebe20589c4032262eb52d4',
       'c9f710f21661765bf4ba544c0f9310db9b2f88c56d76856ed18818a36071c3f1'),
      ('b366748f-6087-4936-a855-7f4593891ed6', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-04-28 18:38:51.88024+00', 270, 220, 390, 660,
       '061d9e8a599fe16f0bdeb2d34b7eeff5725dc611343a2194d5db23a523554f65',
       '82e5a95c088ef5b4831f99550572e40f4e2a5e247c65e541116099fca51b68b9'),
      ('b5430fb1-3032-4680-9dbc-83484453ee1e', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-08-06 12:57:18.844402+00', 390, 360, 780, 360,
       'c746d1751960fad3f4a276966d8dd8fcea89ba943a0254032d5dc67f353aba46',
       'd23ebffdd45a21bb9a8796404b65f7d1ae86587c6c57553c90e176b01d414dd6'),
      ('bffe8a78-97b9-4260-acf3-eaa1888b5a49', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-09-17 21:29:19.374463+00', 300, 160, 300, 320,
       'e8fb3f3c61c2e38c43c859099d06251bcd16e08697c22c4877ca6f5d0c2e901f',
       '2504ad7798a9d32bc485cc04f2296025b73bed854acb7d57930d3354a5009520'),
      ('c55a58f6-8416-4571-b73f-3aef0b04b1e3', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-05-15 17:39:38.724178+00', 0, 120, 0, 240,
       'f80ed590acf26f3579917368f351fc1afe8c97b43c89c17c1272042819bb0f53',
       '4026f140589eb17a0fbc16fa2a3942deb0f5c478e88805392acecc2cf4eb0688'),
      ('cfae19cc-594d-483d-9936-2962c30eeb43', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-10-04 16:28:54.907581+00', 0, 260, 0, 520,
       '55f7b61eadeb5d53356cbdafa07e6e996681fd93e9dbda2def08d30dbe215238',
       'f2035b1dbc2511ac6c3f82f4e900935610069080cf5b6be154b1d12662d17668'),
      ('db484910-f144-40c4-a12b-c55222afceac', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-08-10 23:01:12.986603+00', 0, 400, 0, 500,
       'a3504cec05eb1993c29534c85b8a4ee8ec6dc5bdef61a4fa8bf6ab79c105ec72',
       'af08a938e794cf299bc4cd073b96b35804a7716104efc46e9d456b42a569626a'),
      ('e4cadc5b-63af-4965-8071-16253b41b766', '45d03f03-558b-4cce-bbcb-0fd45f965e7a', '2026-08-27 14:14:07.753269+00', 80, 410, 80, 820,
       '75bb63cb934934cea23aca0ba4b408f2155168d9ff56738f487398a8b1c765ae',
       'd499b31d9ee9eae5d254f115ec120aadd12b6a8bb04ffcb74a75d868c3366bd4'),
      ('f693a3bf-d05d-4d40-ab40-292bfffdbe2f', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-09-18 13:37:26.17402+00', 470, 360, 470, 540,
       'c111d4e58f0cfc0e45487ea0d9c2494f30c174d9534b3635aad58a8994a217e5',
       'ab0a9f32b960f3583cf68980191c5c31e9f0c943ab5e5d0562662866ce7e4d50'),
      ('f8315f7a-eec0-44a3-8c39-60b4ad2a0ba8', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-07-10 10:07:46.688686+00', 0, 410, 0, 580,
       '2b7aa8ed4dec0d5b163dcfb473e23b0907c821c04203f866ad7072807c742211',
       '95b52a26f86e637f4225a598bf2b5d4469ef5021fd1823cdd08de85ddcc588e8'),
      ('log-cfwi6nli', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-05 22:21:58.805015+00', 200, 100, 400, 100,
       '5867a52cd07befef85d92e40372ad34f68c7c0addf576f42a3beef71ff7ac6c2',
       'bce68cdfd9f3d8cf2395a7b1f47f5a009865676d95a7b05cf42d3f2a37c4559c'),
      ('log-hryzg353', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-15 22:41:14.45814+00', 200, 220, 200, 320,
       '674498a1f39d17356a83eacee0ea9eb4f58a85c3ae5282ed54d705584e99e412',
       '9e891cb9c675b3e1a6fc33d606ce6a6014259f0bc439610d2a106aea90edda89'),
      ('log-kquv8agw', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-05 22:22:01.704418+00', 620, 710, 1240, 710,
       'b1b9b076f26765c4d7b746210134a4adae8c6207119abec5737b229ced1c0145',
       'e43dbe3056cca0eeb6ce657efb78e3eeee26d0f5734907f3df080d0c135b0937'),
      ('log-m68g0qec', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-05 22:22:02.079865+00', 100, 350, 160, 350,
       '134f1745322e6720d5f72df70c49dab824f9b371a9fd2c251bd82c44dfbbce24',
       'df534a5208390fed899a5232c0a15dd86cfebced2fa759027d9bb3ff3b8e84cd'),
      ('log-ufdqvgls', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-05 22:22:04.339535+00', 350, 110, 710, 330,
       'e18284a92a9f5f3b68782f6147f112a3f281bfa9a9eedcbcd1af680dd8faa7eb',
       'd13ed455eb74067f7c5a76bc8ac3ff666fe1fd245b9bfbbf57c69bf4eef967b9'),
      ('log-zb4a74wr', '1e76c12c-c6c7-4a3b-bd5c-a636f0e47a8e', '2026-04-05 22:22:05.784605+00', 520, 0, 980, 0,
       '9edba6a138b7938d3cbd9ca08b1069d32ddf99104b3c4de1808229429124c553',
       'ec3a46e553775911f1a8a6ff4dd2d8e4a69fe1b13a00837faaaf3feee6ab05c6'),
      ('perf-0185bcee-52d9-45a8-8040-7942e0d96563', '6590ebfe-95e3-40d0-9818-4af010092b85', '2026-04-14 22:32:01.446895+00', 210, 180, 210, 360,
       '13f49411a8aad085965bc837c9d3e8e7c58ad2649b98205f68c1044d70fd7426',
       '20a7285e542060f8017adaba9ec8233d341d99a76f4a8f9a502396e2ed3d01cc'),
      ('perf-log-cfwi6nli', '6590ebfe-95e3-40d0-9818-4af010092b85', '2026-04-05 22:21:58.805015+00', 200, 100, 400, 100,
       '5867a52cd07befef85d92e40372ad34f68c7c0addf576f42a3beef71ff7ac6c2',
       'bce68cdfd9f3d8cf2395a7b1f47f5a009865676d95a7b05cf42d3f2a37c4559c'),
      ('perf-log-hryzg353', '6590ebfe-95e3-40d0-9818-4af010092b85', '2026-04-15 22:41:14.45814+00', 200, 220, 200, 320,
       '674498a1f39d17356a83eacee0ea9eb4f58a85c3ae5282ed54d705584e99e412',
       '9e891cb9c675b3e1a6fc33d606ce6a6014259f0bc439610d2a106aea90edda89'),
      ('perf-log-kquv8agw', '6590ebfe-95e3-40d0-9818-4af010092b85', '2026-04-05 22:22:01.704418+00', 620, 710, 1240, 710,
       'b1b9b076f26765c4d7b746210134a4adae8c6207119abec5737b229ced1c0145',
       'e43dbe3056cca0eeb6ce657efb78e3eeee26d0f5734907f3df080d0c135b0937'),
      ('perf-log-m68g0qec', '6590ebfe-95e3-40d0-9818-4af010092b85', '2026-04-05 22:22:02.079865+00', 100, 350, 160, 350,
       '134f1745322e6720d5f72df70c49dab824f9b371a9fd2c251bd82c44dfbbce24',
       'df534a5208390fed899a5232c0a15dd86cfebced2fa759027d9bb3ff3b8e84cd'),
      ('perf-log-ufdqvgls', '6590ebfe-95e3-40d0-9818-4af010092b85', '2026-04-05 22:22:04.339535+00', 350, 110, 710, 330,
       'e18284a92a9f5f3b68782f6147f112a3f281bfa9a9eedcbcd1af680dd8faa7eb',
       'd13ed455eb74067f7c5a76bc8ac3ff666fe1fd245b9bfbbf57c69bf4eef967b9'),
      ('perf-log-zb4a74wr', '6590ebfe-95e3-40d0-9818-4af010092b85', '2026-04-05 22:22:05.784605+00', 520, 0, 980, 0,
       '9edba6a138b7938d3cbd9ca08b1069d32ddf99104b3c4de1808229429124c553',
       'ec3a46e553775911f1a8a6ff4dd2d8e4a69fe1b13a00837faaaf3feee6ab05c6')
      -- repair-rows:end
  ;

  select count(*) into v_expected from festival_damage_repair;

  -- Lock every candidate in a stable order before reading its guards.
  perform 1
  from public.logs as log
  where log.id in (select repair.id from festival_damage_repair as repair)
  order by log.id
  for update;

  select count(*) into v_present
  from public.logs as log
  join festival_damage_repair as repair on repair.id = log.id;

  if v_present = 0 then
    raise notice 'Festival Lead damage repair: no candidate rows present; nothing to change.';
    drop table festival_damage_repair;
    return;
  end if;

  select count(*) into v_matching
  from public.logs as log
  join festival_damage_repair as repair on repair.id = log.id
  where log.user_id = repair.user_id
    and log.updated_at = repair.expected_updated_at
    and log.self_attack_damage = repair.old_self_damage
    and log.opponent_attack_damage = repair.old_opponent_damage
    and encode(sha256(convert_to(coalesce(log.raw_log, ''), 'UTF8')), 'hex') = repair.raw_log_sha256
    and encode(sha256(convert_to(log.sections::text, 'UTF8')), 'hex') = repair.sections_sha256;

  -- A repeated run finds the reviewed values already stored and changes nothing.
  select count(*) into v_repaired
  from public.logs as log
  join festival_damage_repair as repair on repair.id = log.id
  where log.user_id = repair.user_id
    and log.self_attack_damage = repair.new_self_damage
    and log.opponent_attack_damage = repair.new_opponent_damage
    and encode(sha256(convert_to(coalesce(log.raw_log, ''), 'UTF8')), 'hex') = repair.raw_log_sha256
    and encode(sha256(convert_to(log.sections::text, 'UTF8')), 'hex') = repair.sections_sha256;

  if v_present = v_expected and v_repaired = v_expected then
    raise notice 'Festival Lead damage repair: all % rows already corrected; nothing to change.', v_expected;
    drop table festival_damage_repair;
    return;
  end if;

  if v_present <> v_expected or v_matching <> v_expected then
    raise exception 'Festival Lead damage repair aborted: % of % rows present, % match their reviewed guards.',
      v_present, v_expected, v_matching;
  end if;

  update public.logs as log
  set
    self_attack_damage = repair.new_self_damage,
    opponent_attack_damage = repair.new_opponent_damage
  from festival_damage_repair as repair
  where repair.id = log.id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'Festival Lead damage repair aborted: updated % of % rows.', v_updated, v_expected;
  end if;

  drop table festival_damage_repair;
end
$repair$;
