import type { Database } from "../db/connection.js";
import { transaction } from "../db/connection.js";
import { routeMatchesUrl } from "../drift/detector.js";

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Derive endpoint-level contract rows from the indexed producer/consumer
 * halves: every api-route becomes an `http-endpoint` contract produced by its
 * service, with `consumers` listing the services whose recorded fetch/axios
 * calls (api_calls) hit that route. Fully derived data — recomputed
 * (delete + reinsert) on every call, safe to run after any (re)index.
 *
 * Returns the number of contract rows written.
 */
export function populateHttpContracts(db: Database): number {
  const routes = db
    .prepare("SELECT id, route_path, http_methods, service FROM routes WHERE kind = 'api-route'")
    .all() as { id: string; route_path: string; http_methods: string; service: string }[];

  const calls = db
    .prepare("SELECT DISTINCT url, method, service FROM api_calls")
    .all() as { url: string; method: string; service: string }[];

  const insert = db.prepare(
    "INSERT OR REPLACE INTO contracts (id, kind, source_path, producer, consumers, last_verified) VALUES (?, 'http-endpoint', ?, ?, ?, ?)",
  );
  const now = new Date().toISOString();

  // Delete + reinsert in ONE transaction so a crash mid-population can never
  // leave consumers observing an empty/partial contracts view.
  transaction(db, () => {
    db.prepare("DELETE FROM contracts WHERE kind = 'http-endpoint'").run();
    for (const route of routes) {
      // Match the call's method against the route's declared methods so a
      // GET-only caller isn't counted as a consumer of a POST route. Route
      // rows carry a method list (the C#/py/go analyzers emit one method per
      // api-route row; the Next.js analyzer may list several on one row) — an
      // empty list means "any/unknown method" and matches any call.
      const methods = new Set(safeParseJson<string[]>(route.http_methods, []));
      const consumers = [
        ...new Set(
          calls
            .filter(
              (c) =>
                (methods.size === 0 || methods.has(c.method)) &&
                routeMatchesUrl(route.route_path, c.url.split("?")[0].split("#")[0]),
            )
            .map((c) => c.service),
        ),
      ].sort();
      insert.run(
        // contracts.id is a global PK across contract kinds — namespace by
        // kind so a future kind reusing route-style IDs can't silently
        // overwrite these rows via INSERT OR REPLACE.
        `http-endpoint::${route.id}`,
        route.route_path,
        route.service,
        JSON.stringify(consumers),
        now,
      );
    }
  });

  return routes.length;
}
