import "server-only";

import { runMigrations } from "@/lib/db/migrate";
import { seedAdminIfNeeded } from "@/lib/db/seed-admin";
import { assertRuntimeEnv } from "@/lib/env/assert-runtime";
import { mergeAndCleanupForms } from "@/lib/tracking/merge-forms";

let bootPromise: Promise<void> | null = null;

/** Validate env (prod), then migrations + admin seed once per process. */
export function ensureDbReady(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      assertRuntimeEnv();
      await runMigrations();
      await seedAdminIfNeeded();
      try {
        const result = await mergeAndCleanupForms();
        if (result.mergedGroups || result.deletedForms || result.deletedLeads) {
          console.info("[boot] forms cleanup", result);
        }
      } catch (err) {
        console.error("[boot] forms cleanup failed", err);
      }
    })().catch((err) => {
      bootPromise = null;
      throw err;
    });
  }
  return bootPromise;
}
