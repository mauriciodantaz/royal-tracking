import "server-only";

import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { getPostgresConfig } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __royalTrackingPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__royalTrackingPool) {
    const config = getPostgresConfig();
    switch (config.mode) {
      case "parts":
        globalThis.__royalTrackingPool = new Pool({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          max: 10,
        });
        break;
      case "url":
        globalThis.__royalTrackingPool = new Pool({
          connectionString: config.connectionString,
          max: 10,
        });
        break;
      default: {
        const _exhaustive: never = config;
        throw new Error(`Unknown postgres config: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
  return globalThis.__royalTrackingPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}
