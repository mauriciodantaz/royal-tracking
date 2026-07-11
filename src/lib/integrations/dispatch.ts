import "server-only";

import { resolveDispatchTargets } from "@/lib/integrations/connections";
import {
  sendToConnection,
  type OutboundEventInput,
  type OutboundResult,
} from "@/lib/integrations/outbound";
import type { MetaCustomData, MetaUserData } from "@/lib/meta/capi";

export type DispatchInput = {
  sourceProvider: string;
  sourceConnectionId?: string | null;
  sourceEvent: string;
  eventId: string;
  eventSourceUrl?: string | null;
  userData: MetaUserData;
  customData?: MetaCustomData;
  gaClientId?: string | null;
  gaSessionId?: string | null;
  debug?: boolean;
};

export type DispatchResult = {
  targets: number;
  results: OutboundResult[];
};

/**
 * Fan-out: resolve mappings for source event → send to each dest connection.
 */
export async function dispatchEvent(
  input: DispatchInput
): Promise<DispatchResult> {
  const targets = await resolveDispatchTargets({
    sourceConnectionId: input.sourceConnectionId,
    sourceProvider: input.sourceProvider,
    sourceEvent: input.sourceEvent,
  });

  const results: OutboundResult[] = [];
  for (const t of targets) {
    const outbound: OutboundEventInput = {
      eventId: input.eventId,
      eventName: t.destEventName,
      eventSourceUrl: input.eventSourceUrl,
      userData: input.userData,
      customData: input.customData,
      gaClientId: input.gaClientId,
      gaSessionId: input.gaSessionId,
      debug: input.debug,
    };
    results.push(await sendToConnection(t.dest, outbound));
  }

  return { targets: targets.length, results };
}
