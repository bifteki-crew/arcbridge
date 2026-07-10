export interface Session {
  userId: string;
  token: string;
  issuedAt: number;
}

const sessions = new Map<string, Session>();

export function issueToken(userId: string): Session {
  const token = `tok_${userId}_${sessions.size}`;
  const session: Session = { userId, token, issuedAt: 0 };
  sessions.set(token, session);
  return session;
}

export function verifyToken(token: string): Session | null {
  return sessions.get(token) ?? null;
}

export function revokeToken(token: string): boolean {
  return sessions.delete(token);
}
