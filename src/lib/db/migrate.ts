import "server-only";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getPool, query } from "@/lib/db/pool";

/** Apply SQL files in db/migrations in lexical order (idempotent CREATE IF NOT EXISTS). */
export async function runMigrations(): Promise<void> {
  const dir = join(process.cwd(), "db", "migrations");
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return;
  }

  await query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  for (const file of files) {
    const existing = await query(
      `select 1 from schema_migrations where id = $1`,
      [file]
    );
    if (existing.rowCount && existing.rowCount > 0) continue;

    const sql = readFileSync(join(dir, file), "utf8");
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        `insert into schema_migrations (id) values ($1) on conflict do nothing`,
        [file]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }
}
