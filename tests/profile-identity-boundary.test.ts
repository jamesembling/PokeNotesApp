import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function functionBlock(contents: string, functionName: string, nextFunctionName?: string) {
  const start = contents.indexOf(`export async function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const end = nextFunctionName
    ? contents.indexOf(`export async function ${nextFunctionName}`, start)
    : contents.length;

  assert.notEqual(end, -1, `${nextFunctionName} should exist`);
  return contents.slice(start, end);
}

test("profile synchronization and activity use the protected database interfaces", () => {
  const profileDb = source("lib/db/profile.ts");
  const syncBlock = functionBlock(
    profileDb,
    "syncCurrentProfileFromAuthUser",
    "updateCurrentProfile"
  );

  assert.match(syncBlock, /rpc\("sync_current_profile"\)/);
  assert.match(profileDb, /rpc\("touch_current_profile_activity"\)/);
  assert.doesNotMatch(syncBlock, /\.from\("profiles"\)\.upsert|\.upsert\(/);
  assert.doesNotMatch(profileDb, /update\(\{\s*last_active_at/);
});

test("direct profile edits contain only the approved editable fields", () => {
  const profileDb = source("lib/db/profile.ts");
  const updateBlock = functionBlock(
    profileDb,
    "updateCurrentProfile",
    "updateCurrentProfileAvatar"
  );
  const payload = updateBlock.match(/const payload = \{([\s\S]*?)\n\s*\};/)?.[1] ?? "";

  for (const column of [
    "display_name",
    "first_name",
    "last_name",
    "ptcgl_username",
    "avatar_color"
  ]) {
    assert.match(payload, new RegExp(`\\b${column}\\b`));
  }

  for (const protectedColumn of [
    "id",
    "email",
    "role",
    "auth_account_created_at",
    "last_login_at",
    "last_active_at",
    "created_at",
    "updated_at"
  ]) {
    assert.doesNotMatch(payload, new RegExp(`\\b${protectedColumn}\\b`));
  }

  assert.match(updateBlock, /\.from\("profiles"\)[\s\S]*?\.update\(payload\)/);
  assert.match(updateBlock, /\.update\(payload\)[\s\S]*?\.eq\("id", user\.id\)/);
  assert.doesNotMatch(updateBlock, /\.upsert\(/);

  const avatarBlock = functionBlock(profileDb, "updateCurrentProfileAvatar");
  const avatarUpdate = avatarBlock.match(/\.update\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  assert.match(avatarUpdate, /avatar_color/);
  assert.doesNotMatch(avatarUpdate, /\b(id|email|role|last_active_at)\b/);
});

test("database profile role controls shared-shell and admin authorization", () => {
  const layout = source("app/(app)/layout.tsx");
  const adminDb = source("lib/db/admin.ts");
  const roleUpdateBlock = functionBlock(adminDb, "updateAdminUserRole");

  assert.match(layout, /getCurrentSidebarProfile\(\)/);
  assert.match(layout, /isAdmin: profile\.role === "admin"/);
  assert.doesNotMatch(layout, /app_metadata|user_metadata.*role|getAuthClaimIsAdmin/);

  assert.match(roleUpdateBlock, /createAdminClient\(\)/);
  assert.match(roleUpdateBlock, /rpc\("set_profile_role"/);
  assert.match(roleUpdateBlock, /p_actor_user_id: actingUser\.id/);
  assert.doesNotMatch(roleUpdateBlock, /auth\.admin|app_metadata|\.update\(\{\s*role/);
  assert.doesNotMatch(roleUpdateBlock, /adminCount|only admin account/);
});
