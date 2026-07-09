export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function isEmail(v: unknown): boolean {
  return isNonEmptyString(v) && /.+@.+\..+/.test(v);
}

export function requireField(obj: Record<string, unknown>, field: string): void {
  if (!(field in obj)) {
    throw new Error(`Missing required field: ${field}`);
  }
}
