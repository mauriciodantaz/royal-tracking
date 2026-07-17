import "server-only";

import { decryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type { Ga4AccountRow } from "@/lib/db/types";

export type Ga4EventInput = {
  clientId: string;
  sessionId?: string | null;
  eventName: string;
  params?: Record<string, unknown>;
  debug?: boolean;
};

export type Ga4PurchaseInput = {
  clientId: string;
  sessionId?: string | null;
  transactionId: string;
  value: number;
  currency: string;
  items: Array<{
    item_id?: string;
    item_name?: string;
    price?: number;
    quantity?: number;
  }>;
  debug?: boolean;
};

export type Ga4DestinationResult = {
  measurement_id: string;
  label: string;
  ok: boolean;
  status: number;
  payload: unknown;
  response: unknown;
  error?: string;
};

async function loadActiveGa4() {
  await ensureDbReady();
  const fromHub = await query<{
    id: string;
    label: string;
    measurement_id: string;
    api_secret_cipher: string | null;
    active: boolean;
  }>(
    `select id, label,
            coalesce(config->>'measurement_id', account_external_id) as measurement_id,
            access_token_cipher as api_secret_cipher,
            active
     from integration_connections
     where provider = 'ga4' and active = true`
  );
  if (fromHub.rows.length > 0) return fromHub.rows;

  const result = await query<
    Pick<
      Ga4AccountRow,
      "id" | "label" | "measurement_id" | "api_secret_cipher" | "active"
    >
  >(
    `select id, label, measurement_id, api_secret_cipher, active
     from ga4_accounts where active = true`
  );
  return result.rows;
}

async function sendPayloadToAccounts(
  payload: unknown,
  debug?: boolean
): Promise<Ga4DestinationResult[]> {
  const accounts = await loadActiveGa4();
  const results: Ga4DestinationResult[] = [];

  for (const account of accounts) {
    if (!account.api_secret_cipher) {
      results.push({
        measurement_id: account.measurement_id,
        label: account.label,
        ok: false,
        status: 0,
        payload,
        response: null,
        error: "missing_api_secret",
      });
      continue;
    }

    let secret: string;
    try {
      secret = await decryptSecret(account.api_secret_cipher as string);
    } catch (err) {
      results.push({
        measurement_id: account.measurement_id,
        label: account.label,
        ok: false,
        status: 0,
        payload,
        response: null,
        error: err instanceof Error ? err.message : "decrypt_failed",
      });
      continue;
    }

    const base = debug
      ? "https://www.google-analytics.com/debug/mp/collect"
      : "https://www.google-analytics.com/mp/collect";
    const url = `${base}?measurement_id=${encodeURIComponent(account.measurement_id)}&api_secret=${encodeURIComponent(secret)}`;

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
      results.push({
        measurement_id: account.measurement_id,
        label: account.label,
        ok: res.ok,
        status: res.status,
        payload,
        response: responseBody,
        error: res.ok ? undefined : "ga4_http_error",
      });
    } catch (err) {
      results.push({
        measurement_id: account.measurement_id,
        label: account.label,
        ok: false,
        status: 0,
        payload,
        response: null,
        error: err instanceof Error ? err.message : "fetch_failed",
      });
    }
  }

  return results;
}

/** Generic GA4 Measurement Protocol event to all active accounts. */
export async function sendEventToAllGa4(
  input: Ga4EventInput
): Promise<Ga4DestinationResult[]> {
  const eventParams: Record<string, unknown> = {
    engagement_time_msec: 1,
    ...(input.params ?? {}),
  };
  if (input.sessionId) eventParams.session_id = input.sessionId;

  const payload = {
    client_id: input.clientId,
    events: [{ name: input.eventName, params: eventParams }],
  };

  return sendPayloadToAccounts(payload, input.debug);
}

/**
 * Measurement Protocol — purchase helper (webhook / tests).
 */
export async function sendPurchaseToAllGa4(
  input: Ga4PurchaseInput
): Promise<Ga4DestinationResult[]> {
  return sendEventToAllGa4({
    clientId: input.clientId,
    sessionId: input.sessionId,
    eventName: "purchase",
    params: {
      event_id: input.transactionId,
      transaction_id: input.transactionId,
      value: input.value,
      currency: input.currency,
      items: input.items,
    },
    debug: input.debug,
  });
}
