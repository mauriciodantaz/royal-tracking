import "server-only";

import {
  configString,
  decryptAccessToken,
} from "@/lib/integrations/connections";
import { refreshConnectionIfNeeded } from "@/lib/integrations/token-refresh";
import type { IntegrationConnectionRow } from "@/lib/db/types";
import type { OutboundEventInput } from "@/lib/integrations/outbound";

/** Google Ads API version for REST upload. */
export const GOOGLE_ADS_API_VERSION = "v19" as const;

function digitsOnly(id: string): string {
  return id.replace(/\D/g, "");
}

function formatConversionDateTime(isoOrNull?: string | null): string {
  const d = isoOrNull ? new Date(isoOrNull) : new Date();
  if (!Number.isFinite(d.getTime())) {
    const now = new Date();
    return formatGoogleAdsDateTime(now);
  }
  return formatGoogleAdsDateTime(d);
}

/** Google Ads expects `yyyy-mm-dd hh:mm:ss+00:00`. */
function formatGoogleAdsDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}-${m}-${day} ${h}:${min}:${s}+00:00`;
}

export type GoogleAdsUploadResult = {
  ok: boolean;
  status: number;
  payload: unknown;
  response: unknown;
  error?: string;
};

/**
 * Upload a click conversion (gclid / wbraid / gbraid) with optional ECL
 * user identifiers (already SHA-256 hashed email/phone).
 */
export async function uploadGoogleAdsClickConversion(
  conn: IntegrationConnectionRow,
  input: OutboundEventInput
): Promise<GoogleAdsUploadResult> {
  const customerRaw =
    configString(conn, "customer_id") ?? conn.account_external_id ?? "";
  const customerId = digitsOnly(customerRaw);
  const conversionActionId = digitsOnly(
    configString(conn, "conversion_action_id") ?? ""
  );
  const loginCustomerId = digitsOnly(
    configString(conn, "login_customer_id") ?? ""
  );
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ?? "";

  if (!customerId) {
    return {
      ok: false,
      status: 0,
      payload: null,
      response: null,
      error: "missing_customer_id",
    };
  }
  if (!conversionActionId) {
    return {
      ok: false,
      status: 0,
      payload: null,
      response: null,
      error: "missing_conversion_action_id",
    };
  }
  if (!developerToken) {
    return {
      ok: false,
      status: 0,
      payload: null,
      response: null,
      error: "missing_developer_token",
    };
  }

  const gclid = input.gclid?.trim() || null;
  const wbraid = input.wbraid?.trim() || null;
  const gbraid = input.gbraid?.trim() || null;
  if (!gclid && !wbraid && !gbraid) {
    return {
      ok: false,
      status: 0,
      payload: null,
      response: null,
      error: "missing_click_id",
    };
  }

  const fresh = await refreshConnectionIfNeeded(conn);
  const token = await decryptAccessToken(fresh);
  if (!token) {
    return {
      ok: false,
      status: 0,
      payload: null,
      response: null,
      error: "missing_access_token",
    };
  }

  const userIdentifiers: Array<Record<string, string>> = [];
  const em = input.userData.emailHash;
  const ph = input.userData.phoneHash;
  if (em) userIdentifiers.push({ hashedEmail: em });
  if (ph) userIdentifiers.push({ hashedPhoneNumber: ph });

  const conversion: Record<string, unknown> = {
    conversionAction: `customers/${customerId}/conversionActions/${conversionActionId}`,
    conversionDateTime: formatConversionDateTime(input.conversionDateTime),
    orderId: input.eventId.slice(0, 100),
  };
  if (gclid) conversion.gclid = gclid;
  else if (wbraid) conversion.wbraid = wbraid;
  else if (gbraid) conversion.gbraid = gbraid;

  if (input.customData?.value != null) {
    conversion.conversionValue = input.customData.value;
    conversion.currencyCode = (
      input.customData.currency ?? "BRL"
    ).toUpperCase();
  }
  if (userIdentifiers.length > 0) {
    conversion.userIdentifiers = userIdentifiers;
  }

  const payload = {
    conversions: [conversion],
    partialFailure: true,
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const responseBody = await res.json().catch(() => null);
    const partialError =
      responseBody &&
      typeof responseBody === "object" &&
      "partialFailureError" in responseBody
        ? "partial_failure"
        : undefined;
    return {
      ok: res.ok && !partialError,
      status: res.status,
      payload,
      response: responseBody,
      error: res.ok
        ? partialError
        : "google_ads_http_error",
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      payload,
      response: null,
      error: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}

/** List accessible customers — used for credential validation. */
export async function listAccessibleCustomers(
  accessToken: string,
  developerToken: string
): Promise<{ ok: boolean; customerIds: string[]; error?: string }> {
  try {
    const res = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
        },
      }
    );
    const json = (await res.json().catch(() => null)) as {
      resourceNames?: string[];
      error?: { message?: string };
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        customerIds: [],
        error: json?.error?.message ?? `http_${res.status}`,
      };
    }
    const ids = (json?.resourceNames ?? []).map((r) =>
      r.replace(/^customers\//, "")
    );
    return { ok: true, customerIds: ids };
  } catch (err) {
    return {
      ok: false,
      customerIds: [],
      error: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}
