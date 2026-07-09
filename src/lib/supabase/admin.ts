import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseUrl } from "@/lib/env";

/**
 * Service-role client — ONLY import from server code (Route Handlers / Server Actions).
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (server-only)");
  }

  return createClient(getSupabaseUrl(), key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
