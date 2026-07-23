import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import {
  postIntegrationErrorToNtfy,
  type IntegrationErrorReport,
} from "@/lib/telemetry/ntfy-errors";

const COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Report outbound delivery failure to maintainer ntfy (not instance admin).
 * Rate-limited per connection (1h). Never throws — logs only.
 */
export async function notifyIntegrationBroken(
  opts: IntegrationErrorReport
): Promise<void> {
  try {
    await ensureDbReady();

    const cooldown = await queryOne<{ last_alerted_at: string }>(
      `select last_alerted_at from integration_alert_cooldowns
       where connection_id = $1 limit 1`,
      [opts.connectionId]
    );

    if (cooldown) {
      const last = new Date(cooldown.last_alerted_at).getTime();
      if (Date.now() - last < COOLDOWN_MS) return;
    }

    const sent = await postIntegrationErrorToNtfy(opts);
    if (!sent) return;

    await query(
      `insert into integration_alert_cooldowns (connection_id, last_alerted_at)
       values ($1, now())
       on conflict (connection_id)
       do update set last_alerted_at = now()`,
      [opts.connectionId]
    );
  } catch (err) {
    console.error("[mail/alerts] notifyIntegrationBroken failed", err);
  }
}
