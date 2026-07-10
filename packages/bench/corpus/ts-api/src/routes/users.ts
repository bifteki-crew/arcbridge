import { put, get, all, type Row } from "../lib/db.js";
import { isNonEmptyString, isEmail, requireField } from "../lib/validation.js";

export function createUser(body: Record<string, unknown>): Row {
  requireField(body, "name");
  requireField(body, "email");
  if (!isNonEmptyString(body.name)) throw new Error("Invalid name");
  if (!isEmail(body.email)) throw new Error("Invalid email");
  const id = `user_${Date.now()}`;
  put(id, body);
  return get(id)!;
}

export function listUsers(): Row[] {
  return all();
}
