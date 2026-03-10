import type { User } from "../models/user.js";

export interface AuthResult {
  authenticated: boolean;
  user: User | null;
  token: string | null;
}

/** Authenticates a user by email and password */
export async function authenticate(
  _email: string,
  _password: string,
): Promise<AuthResult> {
  // stub
  return { authenticated: true, user: null, token: "abc" };
}

export async function validateToken(token: string): Promise<boolean> {
  return token.length > 0;
}

function _internalHelper(): void {
  // Not exported
}
