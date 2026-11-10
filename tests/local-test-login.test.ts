import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "@/app/auth/test-login/route";
import {
  getLocalLoginPageState,
  validateLocalLoginAttempt
} from "@/lib/server/local-test-login";

const developmentEnvironment = {
  NODE_ENV: "development",
  POKE_NOTES_ENABLE_TEST_LOGIN: "1",
  POKE_NOTES_LOCAL_LOGIN_CODE: "correct-local-pairing-code",
  POKE_NOTES_LOCAL_LOGIN_HOSTS:
    "localhost:3000,127.0.0.1:3000,phone-mac.local:3000,192.168.1.10:3000",
  POKE_NOTES_TEST_LOGIN_EMAIL: "test@example.invalid",
  POKE_NOTES_TEST_LOGIN_PASSWORD: "test-password"
};

test("former bearer test-login route always returns a private 404", async () => {
  for (const response of [await GET(), await POST()]) {
    assert.equal(response.status, 404);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  }
});

test("local login is disabled in production even when every variable is populated", () => {
  const environment = {
    ...developmentEnvironment,
    NODE_ENV: "production"
  };

  assert.deepEqual(getLocalLoginPageState("phone-mac.local:3000", environment), {
    requiresPairingCode: true,
    showClaudeLogin: false,
    showLocalLogin: false
  });
  assert.deepEqual(
    validateLocalLoginAttempt(
      {
        host: "phone-mac.local:3000",
        origin: "http://phone-mac.local:3000",
        pairingCode: "correct-local-pairing-code",
        secFetchSite: "same-origin"
      },
      environment
    ),
    { allowed: false, reason: "request" }
  );
});

test("loopback login requires the pairing code without putting it in a URL", () => {
  assert.deepEqual(getLocalLoginPageState("localhost:3000", developmentEnvironment), {
    requiresPairingCode: true,
    showClaudeLogin: false,
    showLocalLogin: true
  });

  const missingCode = validateLocalLoginAttempt(
    {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      pairingCode: "",
      secFetchSite: "same-origin"
    },
    developmentEnvironment
  );

  assert.deepEqual(missingCode, {
    allowed: false,
    origin: "http://localhost:3000",
    reason: "pairing-code"
  });

  assert.equal(
    validateLocalLoginAttempt(
      {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        pairingCode: "correct-local-pairing-code",
        secFetchSite: "same-origin"
      },
      developmentEnvironment
    ).allowed,
    true
  );
});

test("an explicitly allowed LAN host requires the local pairing code", () => {
  assert.deepEqual(getLocalLoginPageState("phone-mac.local:3000", developmentEnvironment), {
    requiresPairingCode: true,
    showClaudeLogin: false,
    showLocalLogin: true
  });

  const validation = validateLocalLoginAttempt(
    {
      host: "phone-mac.local:3000",
      origin: "http://phone-mac.local:3000",
      pairingCode: "correct-local-pairing-code",
      secFetchSite: "same-origin"
    },
    developmentEnvironment
  );

  assert.equal(validation.allowed, true);
  assert.deepEqual(
    validateLocalLoginAttempt(
      {
        host: "phone-mac.local:3000",
        origin: "http://phone-mac.local:3000",
        pairingCode: "wrong-code",
        secFetchSite: "same-origin"
      },
      developmentEnvironment
    ),
    {
      allowed: false,
      origin: "http://phone-mac.local:3000",
      reason: "pairing-code"
    }
  );
});

test("local login rejects unlisted hosts, foreign origins, and cross-site submissions", () => {
  const rejectedRequests = [
    {
      host: "unlisted.local:3000",
      origin: "http://unlisted.local:3000",
      secFetchSite: "same-origin"
    },
    {
      host: "phone-mac.local:3000",
      origin: "https://attacker.example",
      secFetchSite: "same-origin"
    },
    {
      host: "phone-mac.local:3000",
      origin: "http://phone-mac.local:3000",
      secFetchSite: "cross-site"
    }
  ];

  for (const request of rejectedRequests) {
    assert.deepEqual(
      validateLocalLoginAttempt(
        { ...request, pairingCode: "correct-local-pairing-code" },
        developmentEnvironment
      ),
      { allowed: false, reason: "request" }
    );
  }
});

test("LAN login stays hidden until a pairing code is configured", () => {
  assert.deepEqual(
    getLocalLoginPageState("192.168.1.10:3000", {
      ...developmentEnvironment,
      POKE_NOTES_LOCAL_LOGIN_CODE: ""
    }),
    {
      requiresPairingCode: true,
      showClaudeLogin: false,
      showLocalLogin: false
    }
  );
});

test("the Claude account signs in with its own credentials only when configured", () => {
  const attempt = {
    account: "claude",
    host: "localhost:3000",
    origin: "http://localhost:3000",
    pairingCode: "correct-local-pairing-code",
    secFetchSite: "same-origin"
  };
  const claudeEnvironment = {
    ...developmentEnvironment,
    POKE_NOTES_CLAUDE_LOGIN_EMAIL: "claude@example.invalid",
    POKE_NOTES_CLAUDE_LOGIN_PASSWORD: "claude-password"
  };

  assert.equal(getLocalLoginPageState("localhost:3000", claudeEnvironment).showClaudeLogin, true);
  const claude = validateLocalLoginAttempt(attempt, claudeEnvironment);
  assert.equal(claude.allowed && claude.config.email, "claude@example.invalid");
  const fallback = validateLocalLoginAttempt({ ...attempt, account: "" }, claudeEnvironment);
  assert.equal(fallback.allowed && fallback.config.email, "test@example.invalid");
  assert.deepEqual(validateLocalLoginAttempt(attempt, developmentEnvironment), {
    allowed: false,
    reason: "request"
  });
});
