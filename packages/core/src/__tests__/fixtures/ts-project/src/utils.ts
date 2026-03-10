/** Formats a name for display */
export function formatName(first: string, last: string): string {
  return `${first} ${last}`;
}

/** Parses an integer safely */
export const parseIntSafe = (value: string): number | null => {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
};

export const MAX_RETRIES = 3;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const counter = 0;
export { counter };
