import "server-only";

import { persistEventLog } from "@/lib/crm/dispatch";
import { queryOne } from "@/lib/db/pool";
import type { IntegrationConnectionRow, VisitorRow } from "@/lib/db/types";
import { dispatchEvent } from "@/lib/integrations/dispatch";
import {
  parseGenericInbound,
  type GenericInboundParsed,
} from "@/lib/integrations/generic-inbound-parse";
import { ensureVisitorFromPii } from "@/lib/tracking/ensure-visitor-from-pii";
import { newEventId } from "@/lib/tracking/hash";

export { parseGenericInbound, type GenericInboundParsed };

export async function processGenericInboundEvent(opts: {
  conn: IntegrationConnectionRow;
  parsed: GenericInboundParsed;
}): Promise<
  | {
      ok: true;
      event_id: string;
      source_event: string;
    }
  | { ok: true; skipped: string; source_event: string }
> {
  const { conn, parsed } = opts;
  if (!parsed.email && !parsed.phone && !parsed.trckUserId) {
    return {
      ok: true,
      skipped: "missing_identity",
      source_event: parsed.sourceEvent,
    };
  }

  let visitor: VisitorRow | null = null;
  if (parsed.trckUserId) {
    visitor = await queryOne<VisitorRow>(
      `select * from visitors where trck_user_id = $1 limit 1`,
      [parsed.trckUserId]
    );
  }

  const identity = await ensureVisitorFromPii({
    email: parsed.email ?? visitor?.email,
    phone: parsed.phone,
    name: parsed.name,
    dealId: parsed.eventId || parsed.sourceEvent,
  });
  const resolvedVisitor = identity.visitor ?? visitor;
  const trckUserId =
    identity.trckUserId || resolvedVisitor?.trck_user_id || parsed.trckUserId;
  const userData = identity.visitor
    ? identity.userData
    : {
        ...identity.userData,
        email: parsed.email ?? visitor?.email,
        emailHash: visitor?.email_hash,
        phoneHash: visitor?.phone_hash,
        fbp: visitor?.fbp,
        fbc: visitor?.fbc,
        ctwaClid: visitor?.ctwa_clid,
        clientIpAddress: visitor?.ip,
        clientUserAgent: visitor?.user_agent,
        externalId: trckUserId,
        externalIdHash: visitor?.external_id_hash,
      };
  const eventId = parsed.eventId || newEventId();
  const customData =
    parsed.value != null || parsed.currency || parsed.items
      ? {
          value: parsed.value,
          currency: parsed.currency,
          items: parsed.items,
        }
      : undefined;

  const dispatch = await dispatchEvent({
    sourceProvider: conn.provider,
    sourceConnectionId: conn.id,
    sourceEvent: parsed.sourceEvent,
    eventId,
    eventSourceUrl: parsed.eventSourceUrl,
    userData,
    customData,
    extraParams: parsed.params,
    gaClientId: identity.gaResolved.clientId,
    gaClientIdSource: identity.gaResolved.source,
    gaIdentityMeta: identity.gaResolved.meta,
    gaSessionId: resolvedVisitor?.ga_session_id,
    gclid: identity.attr.gclid ?? resolvedVisitor?.gclid,
    wbraid: identity.attr.wbraid ?? resolvedVisitor?.wbraid,
    gbraid: identity.attr.gbraid ?? resolvedVisitor?.gbraid,
    gaUserId: trckUserId,
  });

  await persistEventLog({
    trckUserId: trckUserId ?? null,
    eventName: dispatch.resolvedEventName,
    eventId,
    visitor: resolvedVisitor,
    results: dispatch.results,
    ingestPath: conn.provider,
  });

  return {
    ok: true,
    event_id: eventId,
    source_event: parsed.sourceEvent,
  };
}
