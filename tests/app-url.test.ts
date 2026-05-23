import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAppOriginFromHeaders,
  getConfiguredPublicAppOrigin
} from "@/lib/server/app-url";

function withEnv<T>(values: Record<string, string | undefined>, callback: () => T): T {
  const previous = new Map<string, string | undefined>();

  Object.entries(values).forEach(([key, value]) => {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    return callback();
  } finally {
    previous.forEach((value, key) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
}

test("configured public app origin prefers NEXT_PUBLIC_APP_URL", () => {
  withEnv(
    {
      NEXT_PUBLIC_APP_URL: "https://poke-notes-app.vercel.app/",
      VERCEL_PROJECT_PRODUCTION_URL: "protected-preview.vercel.app"
    },
    () => {
      assert.equal(getConfiguredPublicAppOrigin(), "https://poke-notes-app.vercel.app");
    }
  );
});

test("configured public app origin falls back to Vercel production URL", () => {
  withEnv(
    {
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: "poke-notes-app.vercel.app"
    },
    () => {
      assert.equal(getConfiguredPublicAppOrigin(), "https://poke-notes-app.vercel.app");
    }
  );
});

test("request origin remains header-driven for auth callbacks and local development", () => {
  const headers = new Headers({
    origin: "http://localhost:3000"
  });

  assert.equal(buildAppOriginFromHeaders(headers), "http://localhost:3000");
});
