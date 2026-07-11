import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAppOriginFromHeaders,
  getApprovedAuthRedirectOrigins,
  getConfiguredPublicAppOrigin
} from "@/lib/server/app-url";

test("configured public app origin prefers and normalizes NEXT_PUBLIC_APP_URL", () => {
  assert.equal(
    getConfiguredPublicAppOrigin({
      NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app/some/path/",
      VERCEL_PROJECT_PRODUCTION_URL: "protected-preview.vercel.app"
    }),
    "https://poke-notes-app.vercel.app"
  );
});

test("configured public app origin falls back to Vercel production URL", () => {
  assert.equal(
    getConfiguredPublicAppOrigin({
      VERCEL_PROJECT_PRODUCTION_URL: "poke-notes-app.vercel.app"
    }),
    "https://poke-notes-app.vercel.app"
  );
});

test("approved auth origins include explicit and Vercel-managed destinations", () => {
  assert.deepEqual(
    getApprovedAuthRedirectOrigins({
      NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app",
      POKE_NOTES_AUTH_REDIRECT_ORIGINS:
        "https://review.example.test/, ftp://unsafe.example.test",
      VERCEL_BRANCH_URL: "poke-notes-git-main.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "poke-notes-app.vercel.app",
      VERCEL_URL: "poke-notes-git-review.vercel.app"
    }),
    [
      "https://poke-notes-app.vercel.app",
      "https://review.example.test",
      "https://poke-notes-git-review.vercel.app",
      "https://poke-notes-git-main.vercel.app"
    ]
  );
});

test("a request-controlled Origin cannot override the configured destination", () => {
  const headers = new Headers({
    host: "poke-notes-app.vercel.app",
    origin: "https://attacker.example",
    "x-forwarded-proto": "https"
  });

  assert.equal(
    buildAppOriginFromHeaders(headers, {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app"
    }),
    "https://poke-notes-app.vercel.app"
  );
});

test("an unapproved forwarded host falls back to the configured public origin", () => {
  const headers = new Headers({
    host: "poke-notes-app.vercel.app",
    "x-forwarded-host": "attacker.example",
    "x-forwarded-proto": "https"
  });

  assert.equal(
    buildAppOriginFromHeaders(headers, {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app"
    }),
    "https://poke-notes-app.vercel.app"
  );
});

test("an explicitly approved preview request keeps its own origin", () => {
  const headers = new Headers({
    host: "poke-notes-review.example.test",
    "x-forwarded-proto": "https"
  });

  assert.equal(
    buildAppOriginFromHeaders(headers, {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app",
      POKE_NOTES_AUTH_REDIRECT_ORIGINS: "https://poke-notes-review.example.test"
    }),
    "https://poke-notes-review.example.test"
  );
});

test("the current Vercel deployment URL is an approved preview destination", () => {
  const headers = new Headers({
    host: "poke-notes-git-review.vercel.app",
    "x-forwarded-proto": "https"
  });

  assert.equal(
    buildAppOriginFromHeaders(headers, {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app",
      VERCEL_URL: "poke-notes-git-review.vercel.app"
    }),
    "https://poke-notes-git-review.vercel.app"
  );
});

test("the Vercel branch URL is an approved preview destination", () => {
  const headers = new Headers({
    host: "poke-notes-git-main.vercel.app",
    "x-forwarded-proto": "https"
  });

  assert.equal(
    buildAppOriginFromHeaders(headers, {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app",
      VERCEL_BRANCH_URL: "poke-notes-git-main.vercel.app"
    }),
    "https://poke-notes-git-main.vercel.app"
  );
});

test("development loopback remains available without deployment configuration", () => {
  const headers = new Headers({ host: "localhost:3000" });

  assert.equal(
    buildAppOriginFromHeaders(headers, { NODE_ENV: "development" }),
    "http://localhost:3000"
  );
});

test("an explicitly allowed development phone host remains available", () => {
  const headers = new Headers({ host: "phone-mac.local:3000" });

  assert.equal(
    buildAppOriginFromHeaders(headers, {
      NODE_ENV: "development",
      POKE_NOTES_LOCAL_LOGIN_HOSTS: "phone-mac.local:3000"
    }),
    "http://phone-mac.local:3000"
  );
});

test("an unconfigured, unapproved request fails closed", () => {
  const headers = new Headers({
    host: "attacker.example",
    origin: "https://attacker.example"
  });

  assert.throws(
    () => buildAppOriginFromHeaders(headers, { NODE_ENV: "production" }),
    /No approved application origin/
  );
});
