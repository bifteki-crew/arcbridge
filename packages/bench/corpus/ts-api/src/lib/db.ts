export interface Row {
  id: string;
  data: Record<string, unknown>;
}

const store = new Map<string, Row>();

export function put(id: string, data: Record<string, unknown>): void {
  store.set(id, { id, data });
}

export function get(id: string): Row | undefined {
  return store.get(id);
}

export function remove(id: string): boolean {
  return store.delete(id);
}

export function all(): Row[] {
  return [...store.values()];
}
