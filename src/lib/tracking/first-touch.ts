import "server-only";

import { queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";

export type FirstTouchSnapshot = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  referrer?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  ctwa_clid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
};

/**
 * Freeze first_lead_at + ft_* on the first moment the visitor has email/phone PII.
 * Never overwrites an existing first-touch snapshot.
 */
export async function captureFirstTouchIfNeeded(opts: {
  trckUserId: string;
  hasPii: boolean;
  snapshot: FirstTouchSnapshot;
}): Promise<VisitorRow | null> {
  if (!opts.hasPii || !opts.trckUserId) return null;

  return queryOne<VisitorRow>(
    `update visitors set
       first_lead_at = coalesce(first_lead_at, now()),
       ft_utm_source = coalesce(ft_utm_source, $2),
       ft_utm_medium = coalesce(ft_utm_medium, $3),
       ft_utm_campaign = coalesce(ft_utm_campaign, $4),
       ft_utm_term = coalesce(ft_utm_term, $5),
       ft_utm_content = coalesce(ft_utm_content, $6),
       ft_referrer = coalesce(ft_referrer, $7),
       ft_fbp = coalesce(ft_fbp, $8),
       ft_fbc = coalesce(ft_fbc, $9),
       ft_gclid = coalesce(ft_gclid, $10),
       ft_ttclid = coalesce(ft_ttclid, $11),
       ft_ctwa_clid = coalesce(ft_ctwa_clid, $12),
       ft_wbraid = coalesce(ft_wbraid, $13),
       ft_gbraid = coalesce(ft_gbraid, $14),
       updated_at = now()
     where trck_user_id = $1
       and merged_into_trck_user_id is null
     returning *`,
    [
      opts.trckUserId,
      opts.snapshot.utm_source ?? null,
      opts.snapshot.utm_medium ?? null,
      opts.snapshot.utm_campaign ?? null,
      opts.snapshot.utm_term ?? null,
      opts.snapshot.utm_content ?? null,
      opts.snapshot.referrer ?? null,
      opts.snapshot.fbp ?? null,
      opts.snapshot.fbc ?? null,
      opts.snapshot.gclid ?? null,
      opts.snapshot.ttclid ?? null,
      opts.snapshot.ctwa_clid ?? null,
      opts.snapshot.wbraid ?? null,
      opts.snapshot.gbraid ?? null,
    ]
  );
}
