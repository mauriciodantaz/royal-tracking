import "server-only";

import {
  configString,
  decryptAccessToken,
  logDelivery,
} from "@/lib/integrations/connections";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import {
  buildCapiPayload,
  type MetaCustomData,
  type MetaUserData,
} from "@/lib/meta/capi";
import { META_GRAPH_BASE_URL } from "@/lib/meta/constants";
import { ensureDbReady } from "@/lib/db/boot";
import { queryOne } from "@/lib/db/pool";
import { notifyIntegrationBroken } from "@/lib/mail/alerts";

export type OutboundEventInput = {
  eventId: string;
  eventName: string;
  eventSourceUrl?: string | null;
  userData: MetaUserData;
  customData?: MetaCustomData;
  gaClientId?: string | null;
  gaSessionId?: string | null;
  debug?: boolean;
};

export type OutboundResult = {
  connectionId: string;
  provider: string;
  ok: boolean;
  status: number;
  payload: unknown;
  response: unknown;
  error?: string;
};

async function alertIfError(
  result: Pick<OutboundResult, "ok" | "connectionId" | "provider" | "error">
): Promise<void> {
  if (result.ok || !result.error) return;
  void notifyIntegrationBroken({
    provider: result.provider,
    connectionId: result.connectionId,
    error: result.error,
  });
}

async function resolveTestEventCode(
  conn: IntegrationConnectionRow
): Promise<string | null> {
  const fromConn = configString(conn, "test_event_code");
  if (fromConn) return fromConn;
  await ensureDbReady();
  const data = await queryOne<{ test_event_code: string | null }>(
    `select test_event_code from settings where id = 1 limit 1`
  );
  return data?.test_event_code ?? null;
}

export async function sendToMetaConnection(
  conn: IntegrationConnectionRow,
  input: OutboundEventInput
): Promise<OutboundResult> {
  const pixelId =
    configString(conn, "pixel_id") ?? conn.account_external_id ?? "";
  const token = await decryptAccessToken(conn);
  const testCode = await resolveTestEventCode(conn);
  const payload = buildCapiPayload({
    eventName: input.eventName,
    eventId: input.eventId,
    eventSourceUrl: input.eventSourceUrl,
    userData: input.userData,
    customData: input.customData,
    testEventCode: testCode,
  });

  if (!pixelId || !token) {
    const result: OutboundResult = {
      connectionId: conn.id,
      provider: "meta_pixel",
      ok: false,
      status: 0,
      payload,
      response: null,
      error: !pixelId ? "missing_pixel_id" : "missing_capi_token",
    };
    await logDelivery({
      eventId: input.eventId,
      connectionId: conn.id,
      provider: "meta_pixel",
      destEventName: input.eventName,
      status: "error",
      requestPayload: payload,
      error: result.error,
    });
    return result;
  }

  try {
    const url = `${META_GRAPH_BASE_URL}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseBody = await res.json().catch(() => null);
    const result: OutboundResult = {
      connectionId: conn.id,
      provider: "meta_pixel",
      ok: res.ok,
      status: res.status,
      payload,
      response: responseBody,
      error: res.ok ? undefined : "meta_http_error",
    };
    await logDelivery({
      eventId: input.eventId,
      connectionId: conn.id,
      provider: "meta_pixel",
      destEventName: input.eventName,
      status: res.ok ? "ok" : "error",
      httpStatus: res.status,
      requestPayload: payload,
      responsePayload: responseBody,
      error: result.error,
    });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : "fetch_failed";
    await logDelivery({
      eventId: input.eventId,
      connectionId: conn.id,
      provider: "meta_pixel",
      destEventName: input.eventName,
      status: "error",
      requestPayload: payload,
      error,
    });
    return {
      connectionId: conn.id,
      provider: "meta_pixel",
      ok: false,
      status: 0,
      payload,
      response: null,
      error,
    };
  }
}

export async function sendToGa4Connection(
  conn: IntegrationConnectionRow,
  input: OutboundEventInput
): Promise<OutboundResult> {
  const measurementId =
    configString(conn, "measurement_id") ?? conn.account_external_id ?? "";
  const secret = await decryptAccessToken(conn);

  if (!input.gaClientId) {
    const result: OutboundResult = {
      connectionId: conn.id,
      provider: "ga4",
      ok: false,
      status: 0,
      payload: null,
      response: null,
      error: "missing_ga_client_id",
    };
    await logDelivery({
      eventId: input.eventId,
      connectionId: conn.id,
      provider: "ga4",
      destEventName: input.eventName,
      status: "skipped",
      error: result.error,
    });
    return result;
  }

  const eventParams: Record<string, unknown> = {
    engagement_time_msec: 1,
  };
  if (input.customData?.value != null) eventParams.value = input.customData.value;
  if (input.customData?.currency) eventParams.currency = input.customData.currency;
  if (input.customData?.content_ids) {
    eventParams.items = input.customData.content_ids.map((id) => ({
      item_id: id,
      item_name: input.customData?.content_name,
    }));
  }
  if (input.gaSessionId) eventParams.session_id = input.gaSessionId;
  eventParams.event_id = input.eventId;
  if (input.eventName === "purchase" || input.eventName === "Purchase") {
    eventParams.transaction_id = input.eventId;
  }

  const payload = {
    client_id: input.gaClientId,
    events: [{ name: input.eventName, params: eventParams }],
  };

  if (!measurementId || !secret) {
    const result: OutboundResult = {
      connectionId: conn.id,
      provider: "ga4",
      ok: false,
      status: 0,
      payload,
      response: null,
      error: !measurementId ? "missing_measurement_id" : "missing_api_secret",
    };
    await logDelivery({
      eventId: input.eventId,
      connectionId: conn.id,
      provider: "ga4",
      destEventName: input.eventName,
      status: "error",
      requestPayload: payload,
      error: result.error,
    });
    return result;
  }

  const base = input.debug
    ? "https://www.google-analytics.com/debug/mp/collect"
    : "https://www.google-analytics.com/mp/collect";
  const url = `${base}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(secret)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let responseBody: unknown = text;
    try {
      responseBody = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const result: OutboundResult = {
      connectionId: conn.id,
      provider: "ga4",
      ok: res.ok,
      status: res.status,
      payload,
      response: responseBody,
      error: res.ok ? undefined : "ga4_http_error",
    };
    await logDelivery({
      eventId: input.eventId,
      connectionId: conn.id,
      provider: "ga4",
      destEventName: input.eventName,
      status: res.ok ? "ok" : "error",
      httpStatus: res.status,
      requestPayload: payload,
      responsePayload: responseBody,
      error: result.error,
    });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : "fetch_failed";
    await logDelivery({
      eventId: input.eventId,
      connectionId: conn.id,
      provider: "ga4",
      destEventName: input.eventName,
      status: "error",
      requestPayload: payload,
      error,
    });
    return {
      connectionId: conn.id,
      provider: "ga4",
      ok: false,
      status: 0,
      payload,
      response: null,
      error,
    };
  }
}

export async function sendToConnection(
  conn: IntegrationConnectionRow,
  input: OutboundEventInput
): Promise<OutboundResult> {
  let result: OutboundResult;
  switch (conn.provider) {
    case "meta_pixel":
      result = await sendToMetaConnection(conn, input);
      break;
    case "ga4":
      result = await sendToGa4Connection(conn, input);
      break;
    case "google_ads":
      await logDelivery({
        eventId: input.eventId,
        connectionId: conn.id,
        provider: "google_ads",
        destEventName: input.eventName,
        status: "skipped",
        error: "google_ads_not_implemented",
      });
      result = {
        connectionId: conn.id,
        provider: "google_ads",
        ok: false,
        status: 0,
        payload: null,
        response: null,
        error: "google_ads_not_implemented",
      };
      break;
    default:
      await logDelivery({
        eventId: input.eventId,
        connectionId: conn.id,
        provider: conn.provider,
        destEventName: input.eventName,
        status: "skipped",
        error: "not_an_outbound_adapter",
      });
      result = {
        connectionId: conn.id,
        provider: conn.provider,
        ok: false,
        status: 0,
        payload: null,
        response: null,
        error: "not_an_outbound_adapter",
      };
      break;
  }

  if (
    !result.ok &&
    result.error &&
    result.error !== "google_ads_not_implemented" &&
    result.error !== "not_an_outbound_adapter" &&
    result.error !== "missing_ga_client_id"
  ) {
    await alertIfError(result);
  }

  return result;
}
