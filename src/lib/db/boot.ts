import "server-only";

import { runMigrations } from "@/lib/db/migrate";
import { seedAdminIfNeeded } from "@/lib/db/seed-admin";
import { assertRuntimeEnv } from "@/lib/env/assert-runtime";

let bootPromise: Promise<void> | null = null;

/** Validate env (prod), then migrations + admin seed once per process. */
export function ensureDbReady(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      assertRuntimeEnv();
      await runMigrations();
      await seedAdminIfNeeded();
    })().catch((err) => {
      bootPromise = null;
      throw err;
    });
  }
  return bootPromise;
}
