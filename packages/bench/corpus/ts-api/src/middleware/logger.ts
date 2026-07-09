export function logRequest(method: string, path: string): void {
  // A real logger would write structured output; kept trivial for the fixture.
  void `${method} ${path}`;
}

export function logError(err: unknown): void {
  void (err instanceof Error ? err.message : String(err));
}
