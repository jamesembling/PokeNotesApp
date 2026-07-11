import { getCurrentUser } from "@/lib/auth";

export class ApiAuthenticationError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED" as const;
  readonly status = 401 as const;

  constructor() {
    super("Authentication required.");
    this.name = "ApiAuthenticationError";
  }
}

export function isApiAuthenticationError(
  error: unknown
): error is ApiAuthenticationError {
  return error instanceof ApiAuthenticationError;
}

export async function requireApiUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new ApiAuthenticationError();
  }

  return user;
}
