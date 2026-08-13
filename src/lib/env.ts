/** Public app URL (snippet / Traefik host). */
export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000"
  );
}

/** Nome de exibição da instância (env PROJECT_NAME). */
export function getProjectName(): string {
  return process.env.PROJECT_NAME?.trim() ?? "";
}

const DEFAULT_PLATFORM_NAME = "Royal Tracking";

/** Nome do produto (env PLATFORM_NAME). Ausente/vazio → Royal Tracking. */
export function getPlatformName(): string {
  return process.env.PLATFORM_NAME?.trim() || DEFAULT_PLATFORM_NAME;
}

/** Título HTML: "NOME DO PROJETO | {plataforma}". */
export function getAppTitle(): string {
  const name = getProjectName();
  const platform = getPlatformName();
  return name ? `${name} | ${platform}` : platform;
}

export type PostgresConfig =
  | {
      mode: "parts";
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    }
  | { mode: "url"; connectionString: string };

/**
 * Prefere DB_POSTGRESDB_* (padrão n8n). Fallback: DATABASE_URL legado.
 */
export function getPostgresConfig(): PostgresConfig {
  const host = process.env.DB_POSTGRESDB_HOST?.trim();
  const user = process.env.DB_POSTGRESDB_USER?.trim();
  const password = process.env.DB_POSTGRESDB_PASSWORD;
  const database = process.env.DB_POSTGRESDB_DATABASE?.trim();
  const portRaw = process.env.DB_POSTGRESDB_PORT?.trim();

  if (host && user && password !== undefined && database) {
    const port = Number(portRaw || "5432");
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error("Invalid DB_POSTGRESDB_PORT");
    }
    return { mode: "parts", host, port, user, password, database };
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) {
    return { mode: "url", connectionString };
  }

  throw new Error(
    "Missing Postgres config: set DB_POSTGRESDB_HOST/PORT/USER/PASSWORD/DATABASE (or DATABASE_URL)"
  );
}
