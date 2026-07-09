import "server-only";

import { META_GRAPH_BASE_URL } from "@/lib/meta/constants";
import { decryptSecret } from "@/lib/crypto/secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashEmail, hashPhone, hashPii } from "@/lib/tracking/hash";

export type MetaUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  /** Already-hashed or raw trck_user_id — will be hashed as external_id */
  externalId?: string | null;
  externalIdHash?: string | null;
  emailHash?: string | null;
  phoneHash?: string | null;
  firstNameHash?: string | null;
  lastNameHash?: string | null;
  cityHash?: string | null;
  stateHash?: string | null;
  countryHash?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
};

export type MetaCustomData = {
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
};

export type MetaEventInput = {
  eventName: string;
  eventId: string;
  eventTime?: number;
  eventSourceUrl?: string | null;
  userData: MetaUserData;
  customData?: MetaCustomData;
  testEventCode?: string | null;
};

export type MetaDestinationResult = {
  pixel_id: string;
  label: string;
  ok: boolean;
  status: number;
  payload: unknown;
  response: unknown;
  error?: string;
};

function buildUserData(u: MetaUserData): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const em = u.emailHash ?? (u.email ? hashEmail(u.email) : null);
  const ph = u.phoneHash ?? (u.phone ? hashPhone(u.phone) : null);
  const fn = u.firstNameHash ?? (u.firstName ? hashPii(u.firstName) : null);
  const ln = u.lastNameHash ?? (u.lastName ? hashPii(u.lastName) : null);
  const ct = u.cityHash ?? (u.city ? hashPii(u.city) : null);
  const st = u.stateHash ?? (u.state ? hashPii(u.state) : null);
  const country = u.countryHash ?? (u.country ? hashPii(u.country) : null);
  const external =
    u.externalIdHash ?? (u.externalId ? hashPii(u.externalId) : null);

  if (em) out.em = [em];
  if (ph) out.ph = [ph];
  if (fn) out.fn = [fn];
  if (ln) out.ln = [ln];
  if (ct) out.ct = [ct];
  if (st) out.st = [st];
  if (country) out.country = [country];
  if (external) out.external_id = [external];
  // Do NOT hash fbp / fbc / ip / ua
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  if (u.clientIpAddress) out.client_ip_address = u.clientIpAddress;
  if (u.clientUserAgent) out.client_user_agent = u.clientUserAgent;

  return out;
}

export function buildCapiPayload(input: MetaEventInput) {
  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: "website",
    user_data: buildUserData(input.userData),
  };
  if (input.eventSourceUrl) {
    event.event_source_url = input.eventSourceUrl;
  }
  if (input.customData) {
    event.custom_data = input.customData;
  }

  const body: Record<string, unknown> = {
    data: [event],
  };
  if (input.testEventCode) {
    body.test_event_code = input.testEventCode;
  }
  return body;
}

async function loadActivePixels() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("meta_pixels")
    .select("id, label, pixel_id, capi_token_cipher, active")
    .eq("active", true);
  if (error) throw error;
  return data ?? [];
}

async function loadTestEventCode(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("settings")
    .select("test_event_code")
    .eq("id", 1)
    .maybeSingle();
  return data?.test_event_code ?? null;
}

export async function sendToAllMetaPixels(
  input: Omit<MetaEventInput, "testEventCode"> & {
    testEventCode?: string | null;
  }
): Promise<MetaDestinationResult[]> {
  const pixels = await loadActivePixels();
  const testCode = input.testEventCode ?? (await loadTestEventCode());
  const payload = buildCapiPayload({ ...input, testEventCode: testCode });

  const results: MetaDestinationResult[] = [];

  for (const pixel of pixels) {
    if (!pixel.capi_token_cipher) {
      results.push({
        pixel_id: pixel.pixel_id,
        label: pixel.label,
        ok: false,
        status: 0,
        payload,
        response: null,
        error: "missing_capi_token",
      });
      continue;
    }

    let token: string;
    try {
      token = await decryptSecret(pixel.capi_token_cipher as string);
    } catch (err) {
      results.push({
        pixel_id: pixel.pixel_id,
        label: pixel.label,
        ok: false,
        status: 0,
        payload,
        response: null,
        error: err instanceof Error ? err.message : "decrypt_failed",
      });
      continue;
    }

    const url = `${META_GRAPH_BASE_URL}/${pixel.pixel_id}/events?access_token=${encodeURIComponent(token)}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseBody = await res.json().catch(() => null);
      results.push({
        pixel_id: pixel.pixel_id,
        label: pixel.label,
        ok: res.ok,
        status: res.status,
        payload,
        response: responseBody,
        error: res.ok ? undefined : "meta_http_error",
      });
    } catch (err) {
      results.push({
        pixel_id: pixel.pixel_id,
        label: pixel.label,
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
