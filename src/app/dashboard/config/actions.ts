"use server";

import { revalidatePath } from "next/cache";

import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { sendCapiToPixel } from "@/lib/meta/capi-single";
import { META_GRAPH_BASE_URL } from "@/lib/meta/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { newEventId } from "@/lib/tracking/hash";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  return user;
}

export async function updateSettings(formData: FormData) {
  await requireUser();
  const admin = createAdminClient();
  const webhook_token =
    String(formData.get("webhook_token") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "BRL").trim() || "BRL";
  const test_event_code =
    String(formData.get("test_event_code") ?? "").trim() || null;

  const { error } = await admin.from("settings").upsert({
    id: 1,
    webhook_token,
    currency,
    test_event_code,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function upsertGa4Account(formData: FormData) {
  await requireUser();
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim();
  const measurement_id = String(formData.get("measurement_id") ?? "").trim();
  const api_secret = String(formData.get("api_secret") ?? "").trim();
  const active =
    formData.get("active") === "on" || formData.get("active") === "true";

  if (!label || !measurement_id) {
    throw new Error("label and measurement_id required");
  }

  const row: Record<string, unknown> = { label, measurement_id, active };
  if (api_secret && !api_secret.startsWith("••••")) {
    row.api_secret_cipher = await encryptSecret(api_secret);
  }

  if (id) {
    const { error } = await admin.from("ga4_accounts").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    if (!api_secret) throw new Error("api_secret required for new account");
    row.api_secret_cipher = await encryptSecret(api_secret);
    const { error } = await admin.from("ga4_accounts").insert(row);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function deleteGa4Account(id: string) {
  await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from("ga4_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function upsertMetaPixel(formData: FormData) {
  await requireUser();
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim();
  const pixel_id = String(formData.get("pixel_id") ?? "").trim();
  const capi_token = String(formData.get("capi_token") ?? "").trim();
  const active =
    formData.get("active") === "on" || formData.get("active") === "true";

  if (!label || !pixel_id) throw new Error("label and pixel_id required");

  const row: Record<string, unknown> = { label, pixel_id, active };
  if (capi_token && !capi_token.startsWith("••••")) {
    row.capi_token_cipher = await encryptSecret(capi_token);
  }

  if (id) {
    const { error } = await admin.from("meta_pixels").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    if (!capi_token) throw new Error("capi_token required for new pixel");
    row.capi_token_cipher = await encryptSecret(capi_token);
    const { error } = await admin.from("meta_pixels").insert(row);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function deleteMetaPixel(id: string) {
  await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from("meta_pixels").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function upsertMetaAdAccount(formData: FormData) {
  await requireUser();
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim();
  const ad_account_id = String(formData.get("ad_account_id") ?? "").trim();
  const ads_token = String(formData.get("ads_token") ?? "").trim();
  const active =
    formData.get("active") === "on" || formData.get("active") === "true";

  if (!label || !ad_account_id) {
    throw new Error("label and ad_account_id required");
  }

  const row: Record<string, unknown> = { label, ad_account_id, active };
  if (ads_token && !ads_token.startsWith("••••")) {
    row.ads_token_cipher = await encryptSecret(ads_token);
  }

  if (id) {
    const { error } = await admin
      .from("meta_ad_accounts")
      .update(row)
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    if (!ads_token) throw new Error("ads_token required for new account");
    row.ads_token_cipher = await encryptSecret(ads_token);
    const { error } = await admin.from("meta_ad_accounts").insert(row);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function deleteMetaAdAccount(id: string) {
  await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from("meta_ad_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function testMetaPixel(id: string) {
  await requireUser();
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("settings")
    .select("test_event_code")
    .eq("id", 1)
    .maybeSingle();
  const { data: pixel, error } = await admin
    .from("meta_pixels")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !pixel?.capi_token_cipher) {
    return { ok: false as const, error: "missing_token" };
  }

  const result = await sendCapiToPixel({
    pixelId: pixel.pixel_id,
    tokenCipher: pixel.capi_token_cipher as string,
    input: {
      eventName: "PageView",
      eventId: newEventId(),
      eventSourceUrl: "https://tracking.local/test",
      testEventCode: settings?.test_event_code,
      userData: {
        externalId: "test_connection",
        clientIpAddress: "127.0.0.1",
        clientUserAgent: "TrackingTest/1.0",
      },
    },
  });
  return result;
}

export async function testGa4Account(id: string) {
  await requireUser();
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("ga4_accounts")
    .select("*")
    .eq("id", id)
    .single();
  if (!account?.api_secret_cipher) {
    return { ok: false as const, error: "missing_secret" };
  }

  const secret = await decryptSecret(account.api_secret_cipher as string);
  const payload = {
    client_id: "test.connection.client",
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: `test_${Date.now()}`,
          value: 1,
          currency: "BRL",
          items: [
            {
              item_id: "test",
              item_name: "Connection Test",
              price: 1,
              quantity: 1,
            },
          ],
          engagement_time_msec: 1,
        },
      },
    ],
  };
  const url = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(account.measurement_id)}&api_secret=${encodeURIComponent(secret)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let response: unknown = text;
  try {
    response = text ? JSON.parse(text) : null;
  } catch {
    /* keep */
  }
  return { ok: res.ok, status: res.status, response };
}

export async function testMetaAdAccount(id: string) {
  await requireUser();
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("meta_ad_accounts")
    .select("*")
    .eq("id", id)
    .single();
  if (!account?.ads_token_cipher) {
    return { ok: false as const, error: "missing_token" };
  }

  const token = await decryptSecret(account.ads_token_cipher as string);
  const actId = account.ad_account_id.replace(/^act_/, "");
  const url = `${META_GRAPH_BASE_URL}/act_${actId}?fields=id,name,account_status&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, response: body };
}
