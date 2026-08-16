/**
 * Replay CRM/MKT/Pipedrive emits that never reached events_log, or GA4 skipped for missing client_id.
 * Usage: npx tsx --require ./scripts/stub-server-only.cjs ./scripts/replay-orphans-cli.ts <connectionId> [limit]
 */
import { replayCrmConnection } from "../src/lib/crm/replay";

async function main() {
  const connectionId = process.argv[2]?.trim();
  const limitRaw = process.argv[3]?.trim();
  if (!connectionId) {
    console.error("usage: replay-orphans-cli.ts <connectionId> [limit]");
    process.exit(2);
  }
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isFinite(limit) || (limit ?? 0) <= 0)) {
    console.error("limit must be a positive number");
    process.exit(2);
  }

  const result = await replayCrmConnection(
    connectionId,
    limit ? { limit } : undefined
  );
  console.log(JSON.stringify(result));
  if (result.failed > 0 && result.sent === 0 && result.skipped === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
