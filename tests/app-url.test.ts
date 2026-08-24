import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAppOriginFromHeaders,
  getApprovedAuthRedirectOrigins,
  getConfiguredPublicAppOrigin
} from "@/lib/server/app-url";

test("configured public app origins normalize and select the configured fallback", () => {
  const cases = [
    {
      name: "explicit app URL wins and drops its path",
      environment: {
        NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app/some/path/",
        VERCEL_PROJECT_PRODUCTION_URL: "protected-preview.vercel.app"
      },
      expected: "https://poke-notes-app.vercel.app"
    },
    {
      name: "Vercel production URL is used when the explicit URL is absent",
      environment: {
        VERCEL_PROJECT_PRODUCTION_URL: "poke-notes-app.vercel.app"
      },
      expected: "https://poke-notes-app.vercel.app"
    }
  ];

  for (const scenario of cases) {
    assert.equal(
      getConfiguredPublicAppOrigin(scenario.environment),
      scenario.expected,
      scenario.name
    );
  }
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

test("request headers select only approved deployment or development origins", () => {
  const cases = [
    {
      name: "request Origin cannot override the configured destination",
      headers: new Headers({
        host: "poke-notes-app.vercel.app",
        origin: "https://attacker.example",
        "x-forwarded-proto": "https"
      }),
      environment: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app"
      },
      expected: "https://poke-notes-app.vercel.app"
    },
    {
      name: "unapproved forwarded host falls back to the configured origin",
      headers: new Headers({
        host: "poke-notes-app.vercel.app",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https"
      }),
      environment: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app"
      },
      expected: "https://poke-notes-app.vercel.app"
    },
    {
      name: "explicitly approved preview keeps its own origin",
      headers: new Headers({
        host: "poke-notes-review.example.test",
        "x-forwarded-proto": "https"
      }),
      environment: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app",
        POKE_NOTES_AUTH_REDIRECT_ORIGINS: "https://poke-notes-review.example.test"
      },
      expected: "https://poke-notes-review.example.test"
    },
    {
      name: "current Vercel deployment URL is an approved preview",
      headers: new Headers({
        host: "poke-notes-git-review.vercel.app",
        "x-forwarded-proto": "https"
      }),
      environment: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app",
        VERCEL_URL: "poke-notes-git-review.vercel.app"
      },
      expected: "https://poke-notes-git-review.vercel.app"
    },
    {
      name: "Vercel branch URL is an approved preview",
      headers: new Headers({
        host: "poke-notes-git-main.vercel.app",
        "x-forwarded-proto": "https"
      }),
      environment: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app",
        VERCEL_BRANCH_URL: "poke-notes-git-main.vercel.app"
      },
      expected: "https://poke-notes-git-main.vercel.app"
    },
    {
      name: "development loopback remains available without deployment configuration",
      headers: new Headers({ host: "localhost:3000" }),
      environment: { NODE_ENV: "development" },
      expected: "http://localhost:3000"
    },
    {
      name: "explicitly allowed development phone host remains available",
      headers: new Headers({ host: "phone-mac.local:3000" }),
      environment: {
        NODE_ENV: "development",
        POKE_NOTES_LOCAL_LOGIN_HOSTS: "phone-mac.local:3000"
      },
      expected: "http://phone-mac.local:3000"
    }
  ];

  for (const scenario of cases) {
    assert.equal(
      buildAppOriginFromHeaders(scenario.headers, scenario.environment),
      scenario.expected,
      scenario.name
    );
  }
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
