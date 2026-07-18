import "server-only";

import { getStackAdminEmail } from "@/lib/auth/super-admin";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import { integrationBrokenEmail } from "@/lib/mail/templates";
import { isSmtpConfigured, sendMail } from "@/lib/mail/smtp";

const COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Email super admin when an outbound delivery fails.
 * Rate-limited per connection (1h). Never throws — logs only.
 */
export async function notifyIntegrationBroken(opts: {
  provider: string;
  connectionId: string;
  error: string;
}): Promise<void> {
  try {
    if (!isSmtpConfigured()) return;
    const to = getStackAdminEmail();
    if (!to) return;

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

    const tpl = integrationBrokenEmail(opts);
    await sendMail({ to, ...tpl });

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
