import type { Database } from "../db/connection.js";
import { transaction } from "../db/connection.js";
import { routeMatchesUrl } from "../drift/detector.js";

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
    .prepare("SELECT DISTINCT url, service FROM api_calls")
    .all() as { url: string; service: string }[];

  db.prepare("DELETE FROM contracts WHERE kind = 'http-endpoint'").run();
  if (routes.length === 0) return 0;

  const insert = db.prepare(
    "INSERT OR REPLACE INTO contracts (id, kind, source_path, producer, consumers, last_verified) VALUES (?, 'http-endpoint', ?, ?, ?, ?)",
  );
  const now = new Date().toISOString();

  transaction(db, () => {
    for (const route of routes) {
      const consumers = [
        ...new Set(
          calls
            .filter((c) => routeMatchesUrl(route.route_path, c.url.split("?")[0].split("#")[0]))
            .map((c) => c.service),
        ),
      ].sort();
      insert.run(
        route.id,
        route.route_path,
        route.service,
        JSON.stringify(consumers),
        now,
      );
    }
  });

  return routes.length;
}
