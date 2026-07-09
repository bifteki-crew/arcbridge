import { issueToken, verifyToken, revokeToken, type Session } from "../lib/auth.js";
import { requireField } from "../lib/validation.js";

export function login(body: Record<string, unknown>): Session {
  requireField(body, "userId");
  return issueToken(String(body.userId));
}

export function whoami(token: string): Session {
  const session = verifyToken(token);
  if (!session) throw new Error("Unauthorized");
  return session;
}

export function logout(token: string): boolean {
  return revokeToken(token);
}
