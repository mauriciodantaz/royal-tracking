import "server-only";

import { decryptSecret } from "@/lib/crypto/secrets";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ga4_accounts")
    .select("id, label, measurement_id, api_secret_cipher, active")
    .eq("active", true);
  if (error) throw error;
  return data ?? [];
}

/**
 * Measurement Protocol — ONLY for offline/webhook purchase (do not duplicate gtag events).
 * Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
export async function sendPurchaseToAllGa4(
  input: Ga4PurchaseInput
): Promise<Ga4DestinationResult[]> {
  const accounts = await loadActiveGa4();
  const results: Ga4DestinationResult[] = [];

  const eventParams: Record<string, unknown> = {
    transaction_id: input.transactionId,
    value: input.value,
    currency: input.currency,
    items: input.items,
    engagement_time_msec: 1,
  };
  if (input.sessionId) {
    eventParams.session_id = input.sessionId;
  }

  const payload = {
    client_id: input.clientId,
    events: [
      {
        name: "purchase",
        params: eventParams,
      },
    ],
  };

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

    const base = input.debug
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
