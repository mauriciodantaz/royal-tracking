export type ListConnectionsOpts = {
  provider?: string;
  activeOnly?: boolean;
  direction?: string;
};

/** Pure SQL builder — params must be passed to `query()` or Postgres raises 42P02. */
export function buildListConnectionsQuery(opts?: ListConnectionsOpts): {
  text: string;
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.provider) {
    params.push(opts.provider);
    clauses.push(`provider = $${params.length}`);
  }
  if (opts?.activeOnly) {
    clauses.push(`active = true`);
  }
  if (opts?.direction) {
    params.push(opts.direction);
    clauses.push(`(direction = $${params.length} or direction = 'both')`);
  }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  return {
    text: `select * from integration_connections ${where} order by provider, label`,
    params,
  };
}
