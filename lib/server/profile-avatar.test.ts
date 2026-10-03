import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { AvatarValidationError, isProfileAvatarUploadSameOrigin, prepareProfileAvatar } from "./profile-avatar";
import { MAX_AVATAR_BYTES } from "../profile-avatar";

test("profile photos decode into bounded square WebP with private metadata removed", async () => {
  const original = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 234, g: 69, b: 93 } } })
    .jpeg().withExif({ IFD0: { Artist: "Private photo owner" } }).toBuffer();
  const output = await prepareProfileAvatar(new File([new Uint8Array(original)], "photo.jpg", { type: "image/jpeg" }));
  const decoded = await sharp(output).metadata();
  assert.equal(decoded.format, "webp");
  assert.equal(decoded.width, 512);
  assert.equal(decoded.height, 512);
  assert.equal(decoded.exif, undefined);
  assert.equal(decoded.xmp, undefined);
  const pixel = await sharp(output).resize(1, 1).raw().toBuffer();
  assert.ok(pixel[0] > 200 && pixel[1] < 100, "Re-encoding retains the supplied photo content");
});

test("profile upload validates the browser origin and rejects oversized or forged image bytes", async () => {
  const request = (headers: Record<string, string>, url = "http://0.0.0.0:3010/api/profile/avatar") => new Request(url, { headers });
  assert.equal(isProfileAvatarUploadSameOrigin(request({ host: "localhost:3010", origin: "http://localhost:3010", "sec-fetch-site": "same-origin" })), true);
  assert.equal(isProfileAvatarUploadSameOrigin(request({ host: "app.example.com", origin: "https://app.example.com" }, "https://internal.example.com/api/profile/avatar")), true);
  for (const headers of [
    { host: "localhost:3010" },
    { origin: "http://localhost:3010" },
    { host: "localhost:3010", origin: "null" },
    { host: "localhost:3010", origin: "not a URL" },
    { host: "localhost:3010", origin: "http://localhost:3011" },
    { host: "localhost:3010", origin: "https://localhost:3010" },
    { host: "localhost:3010", origin: "http://localhost:3010/path" },
    { host: "localhost:3010", origin: "http://user@localhost:3010" },
    { host: "localhost:3010", origin: "http://localhost:3010", "sec-fetch-site": "cross-site" },
    { host: "localhost:3010", origin: "https://attacker.example", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" },
    { host: "localhost:3010/path", origin: "http://localhost:3010" }
  ] as Record<string, string>[]) assert.equal(isProfileAvatarUploadSameOrigin(request(headers)), false);

  const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  for (const file of [
    new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "large.png", { type: "image/png" }),
    new File([], "empty.png", { type: "image/png" }),
    new File(["<svg></svg>"], "fake.png", { type: "image/png" }),
    new File([new Uint8Array(png)], "fake.jpg", { type: "image/jpeg" }),
    new File([new Uint8Array(png)], "photo.svg", { type: "image/svg+xml" })
  ]) await assert.rejects(prepareProfileAvatar(file), AvatarValidationError);
  const output = await prepareProfileAvatar(new File([new Uint8Array(png)], "photo.png", { type: "image/png" }));
  const decoded = await sharp(output).metadata();
  assert.equal(decoded.width, 10);
  assert.equal(decoded.height, 10);
});

test("avatar rollout retries only a missing profile avatar column and preserves unrelated failures", async () => {
  const { withProfileAvatarColumn, profileAvatarColumns } = await import("../db/profile-avatar-compatibility");
  const calls: string[] = [];
  const result = await withProfileAvatarColumn(async includeAvatar => {
    calls.push(profileAvatarColumns("id,avatar_path,avatar_color", includeAvatar));
    return includeAvatar
      ? { data: null, error: { code: "42703", message: "column profiles.avatar_path does not exist" } }
      : { data: "existing account", error: null };
  });
  assert.equal(result.data, "existing account");
  assert.deepEqual(calls, ["id,avatar_path,avatar_color", "id,avatar_color"]);
  for (const error of [
    { code: "42501", message: "permission denied for profiles.avatar_path" },
    { code: "42703", message: "column profiles.display_name does not exist" },
    { code: "42703", message: "column another_table.avatar_path does not exist" }
  ]) {
    let attempts = 0;
    const unchanged = await withProfileAvatarColumn(async () => { attempts++; return { error }; });
    assert.equal(unchanged.error, error);
    assert.equal(attempts, 1);
  }
});
