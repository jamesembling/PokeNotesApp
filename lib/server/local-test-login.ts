import { createHash, timingSafeEqual } from "node:crypto";

type LocalLoginEnvironment = {
  NODE_ENV?: string;
  POKE_NOTES_ENABLE_TEST_LOGIN?: string;
  POKE_NOTES_LOCAL_LOGIN_CODE?: string;
  POKE_NOTES_LOCAL_LOGIN_HOSTS?: string;
  POKE_NOTES_TEST_LOGIN_EMAIL?: string;
  POKE_NOTES_TEST_LOGIN_PASSWORD?: string;
  POKE_NOTES_CLAUDE_LOGIN_EMAIL?: string;
  POKE_NOTES_CLAUDE_LOGIN_PASSWORD?: string;
};

/** Form value that selects Claude's own local test account instead of the default one. */
export const CLAUDE_LOCAL_LOGIN_ACCOUNT = "claude";

const LOOPBACK_HOSTS = new Set(["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]);

function normalizeHost(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function getAllowedLocalLoginHosts(environment: LocalLoginEnvironment = process.env) {
  const configuredHosts = String(environment.POKE_NOTES_LOCAL_LOGIN_HOSTS || "")
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);

  return new Set([...LOOPBACK_HOSTS, ...configuredHosts]);
}

export function isAllowedLocalLoginHost(
  host: string | null | undefined,
  environment: LocalLoginEnvironment = process.env
) {
  return getAllowedLocalLoginHosts(environment).has(normalizeHost(host));
}

function getLocalLoginConfig(
  environment: LocalLoginEnvironment = process.env,
  account?: string | null
) {
  const enabled =
    environment.NODE_ENV === "development" &&
    environment.POKE_NOTES_ENABLE_TEST_LOGIN === "1";
  const claude = account === CLAUDE_LOCAL_LOGIN_ACCOUNT;
  const email = String(
    (claude ? environment.POKE_NOTES_CLAUDE_LOGIN_EMAIL : environment.POKE_NOTES_TEST_LOGIN_EMAIL) ||
      ""
  );
  const password = String(
    (claude
      ? environment.POKE_NOTES_CLAUDE_LOGIN_PASSWORD
      : environment.POKE_NOTES_TEST_LOGIN_PASSWORD) || ""
  );
  const pairingCode = String(environment.POKE_NOTES_LOCAL_LOGIN_CODE || "");

  return {
    configured: Boolean(enabled && email && password && pairingCode),
    email,
    pairingCode,
    password
  };
}

export function getLocalLoginPageState(
  host: string | null | undefined,
  environment: LocalLoginEnvironment = process.env
) {
  const config = getLocalLoginConfig(environment);
  const allowedHost = isAllowedLocalLoginHost(host, environment);
  const requiresPairingCode = allowedHost;

  const showLocalLogin = Boolean(config.configured && allowedHost);

  return {
    showLocalLogin,
    showClaudeLogin:
      showLocalLogin && getLocalLoginConfig(environment, CLAUDE_LOCAL_LOGIN_ACCOUNT).configured,
    requiresPairingCode
  };
}

export function validateLocalLoginRequest(
  input: {
    account?: string | null | undefined;
    host: string | null | undefined;
    origin: string | null | undefined;
    secFetchSite?: string | null | undefined;
  },
  environment: LocalLoginEnvironment = process.env
) {
  const config = getLocalLoginConfig(environment, input.account);
  const host = normalizeHost(input.host);

  if (!config.configured || !isAllowedLocalLoginHost(host, environment)) {
    return { allowed: false as const };
  }

  let origin: URL;
  try {
    origin = new URL(String(input.origin || ""));
  } catch {
    return { allowed: false as const };
  }

  const validProtocol = origin.protocol === "http:" || origin.protocol === "https:";
  const validOrigin = validProtocol && normalizeHost(origin.host) === host;
  const validFetchSite = !input.secFetchSite || input.secFetchSite === "same-origin";

  if (!validOrigin || !validFetchSite) {
    return { allowed: false as const };
  }

  return {
    allowed: true as const,
    config,
    origin: origin.origin
  };
}

export function validateLocalLoginAttempt(
  input: {
    account?: string | null | undefined;
    host: string | null | undefined;
    origin: string | null | undefined;
    pairingCode: string;
    secFetchSite?: string | null | undefined;
  },
  environment: LocalLoginEnvironment = process.env
) {
  const validation = validateLocalLoginRequest(input, environment);

  if (!validation.allowed) {
    return { allowed: false as const, reason: "request" as const };
  }

  if (!verifyLocalPairingCode(input.pairingCode, validation.config.pairingCode)) {
    return {
      allowed: false as const,
      origin: validation.origin,
      reason: "pairing-code" as const
    };
  }

  return validation;
}

function verifyLocalPairingCode(provided: string, expected: string) {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return Boolean(expected) && timingSafeEqual(providedDigest, expectedDigest);
}
