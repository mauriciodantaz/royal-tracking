import "server-only";

import { runMigrations } from "@/lib/db/migrate";
import { seedAdminIfNeeded } from "@/lib/db/seed-admin";

let bootPromise: Promise<void> | null = null;

/** Run migrations + admin seed once per process. */
export function ensureDbReady(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      await runMigrations();
      await seedAdminIfNeeded();
    })().catch((err) => {
      bootPromise = null;
      throw err;
    });
  }
  return bootPromise;
}
