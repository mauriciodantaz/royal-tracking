import "server-only";

import { replayOrphanPipedriveEmits } from "@/lib/pipedrive/replay-orphans";
import { replayOrphanCrmEmits } from "@/lib/rd/replay-orphans";
import { getConnection } from "@/lib/integrations/connections";

export type ReplayCrmResult = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

/** Replay orphans and GA4 skipped (missing_ga_client_id) for RD CRM/MKT or Pipedrive. */
export async function replayCrmConnection(
  connectionId: string,
  opts?: { limit?: number }
): Promise<ReplayCrmResult> {
  const conn = await getConnection(connectionId);
  if (!conn) {
    return {
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ["connection_not_found"],
    };
  }
  if (conn.provider === "pipedrive") {
    return replayOrphanPipedriveEmits(connectionId, opts);
  }
  if (
    conn.provider === "rdstation_crm" ||
    conn.provider === "rdstation_mkt"
  ) {
    return replayOrphanCrmEmits(connectionId, opts);
  }
  return {
    attempted: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: ["unsupported_provider"],
  };
}
