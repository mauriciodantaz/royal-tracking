import "server-only";

import {
  listConnections,
  resolveDispatchTargets,
} from "@/lib/integrations/connections";
import {
  targetsFromNamedDests,
  type DestNameOverrides,
} from "@/lib/integrations/dest-overrides";
import {
  sendToConnection,
  type OutboundEventInput,
  type OutboundResult,
} from "@/lib/integrations/outbound";
import type {
  MetaActionSource,
  MetaCustomData,
  MetaUserData,
} from "@/lib/meta/capi";
import {
  catalogPolicyFromRow,
  findCustomEvent,
} from "@/lib/tracking/custom-events";
import {
  chooseResolutionPath,
  mergeEventCustomData,
  type EventParamValue,
} from "@/lib/tracking/event-params";
import type {
  GaClientIdSource,
  GaIdentityMeta,
} from "@/lib/tracking/ga-client-id";

export type DispatchInput = {
  sourceProvider: string;
  sourceConnectionId?: string | null;
  sourceEvent: string;
  eventId: string;
  eventSourceUrl?: string | null;
  userData: MetaUserData;
  customData?: MetaCustomData;
  extraParams?: Record<string, EventParamValue>;
  destOverrides?: DestNameOverrides;
  includeGoogleAds?: boolean;
  gaClientId?: string | null;
  gaClientIdSource?: GaClientIdSource | null;
  gaIdentityMeta?: GaIdentityMeta | null;
  gaSessionId?: string | null;
  debug?: boolean;
  actionSource?: MetaActionSource;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  conversionDateTime?: string | null;
  transactionId?: string | null;
  gaUserId?: string | null;
};

export type DispatchResult = {
  targets: number;
  results: OutboundResult[];
  resolvedEventName: string;
  resolutionPath: ReturnType<typeof chooseResolutionPath>;
};

export async function resolveEventDestinations(opts: {
  sourceConnectionId?: string | null;
  sourceProvider: string;
  sourceEvent: string;
  destOverrides?: DestNameOverrides;
  includeGoogleAds?: boolean;
}) {
  const catalog = await findCustomEvent({
    sourceProvider: opts.sourceProvider,
    sourceEvent: opts.sourceEvent,
  });
  const path = chooseResolutionPath({
    catalogMatched: Boolean(catalog),
    hasOverrides: opts.destOverrides != null,
  });

  if (path === "catalog" && catalog) {
    const dests = await listConnections({ activeOnly: true });
    return {
      path,
      catalog,
      targets: targetsFromNamedDests(
        dests,
        {
          meta: catalog.meta_enabled ? catalog.meta_event_name : null,
          ga4: catalog.ga4_enabled ? catalog.ga4_event_name : null,
        },
        true
      ),
    };
  }

  if (path === "overrides" && opts.destOverrides) {
    const dests = await listConnections({ activeOnly: true });
    return {
      path,
      catalog: null,
      targets: targetsFromNamedDests(
        dests,
        opts.destOverrides,
        opts.includeGoogleAds === true
      ),
    };
  }

  return {
    path,
    catalog: null,
    targets: await resolveDispatchTargets({
      sourceConnectionId: opts.sourceConnectionId,
      sourceProvider: opts.sourceProvider,
      sourceEvent: opts.sourceEvent,
    }),
  };
}

/**
 * Fan-out: catálogo / override CRM / mappings / default → cada destino.
 */
export async function dispatchEvent(
  input: DispatchInput
): Promise<DispatchResult> {
  const resolved = await resolveEventDestinations({
    sourceConnectionId: input.sourceConnectionId,
    sourceProvider: input.sourceProvider,
    sourceEvent: input.sourceEvent,
    destOverrides: input.destOverrides,
    includeGoogleAds: input.includeGoogleAds,
  });

  const customData = mergeEventCustomData({
    base: input.customData,
    extraParams: input.extraParams,
    catalog: resolved.catalog
      ? catalogPolicyFromRow(resolved.catalog)
      : null,
  });

  const results: OutboundResult[] = [];
  for (const t of resolved.targets) {
    const outbound: OutboundEventInput = {
      eventId: input.eventId,
      eventName: t.destEventName,
      eventSourceUrl: input.eventSourceUrl,
      userData: input.userData,
      customData,
      gaClientId: input.gaClientId,
      gaClientIdSource: input.gaClientIdSource,
      gaIdentityMeta: input.gaIdentityMeta,
      gaSessionId: input.gaSessionId,
      debug: input.debug,
      actionSource: input.actionSource,
      gclid: input.gclid,
      wbraid: input.wbraid,
      gbraid: input.gbraid,
      conversionDateTime: input.conversionDateTime,
      transactionId: input.transactionId,
      gaUserId: input.gaUserId,
    };
    results.push(await sendToConnection(t.dest, outbound));
  }

  const resolvedEventName =
    resolved.catalog?.slug ||
    input.sourceEvent ||
    input.destOverrides?.meta ||
    input.destOverrides?.ga4 ||
    "Lead";

  return {
    targets: resolved.targets.length,
    results,
    resolvedEventName,
    resolutionPath: resolved.path,
  };
}
