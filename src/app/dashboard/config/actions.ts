"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type {
  Ga4AccountRow,
  MetaAdAccountRow,
  MetaPixelRow,
  SettingsRow,
} from "@/lib/db/types";
import { sendCapiToPixel } from "@/lib/meta/capi-single";
import { META_GRAPH_BASE_URL } from "@/lib/meta/constants";
import { newEventId } from "@/lib/tracking/hash";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("unauthorized");
  await ensureDbReady();
  return session.user;
}

export async function updateSettings(formData: FormData) {
  await requireUser();
  const webhook_token =
    String(formData.get("webhook_token") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "BRL").trim() || "BRL";
  const test_event_code =
    String(formData.get("test_event_code") ?? "").trim() || null;

  await query(
    `insert into settings (id, webhook_token, currency, test_event_code)
     values (1, $1, $2, $3)
     on conflict (id) do update set
       webhook_token = excluded.webhook_token,
       currency = excluded.currency,
       test_event_code = excluded.test_event_code,
       updated_at = now()`,
    [webhook_token, currency, test_event_code]
  );
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function upsertGa4Account(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim();
  const measurement_id = String(formData.get("measurement_id") ?? "").trim();
  const api_secret = String(formData.get("api_secret") ?? "").trim();
  const active =
    formData.get("active") === "on" || formData.get("active") === "true";

  if (!label || !measurement_id) {
    throw new Error("label and measurement_id required");
  }

  if (id) {
    if (api_secret && !api_secret.startsWith("••••")) {
      const cipher = await encryptSecret(api_secret);
      await query(
        `update ga4_accounts set label = $1, measurement_id = $2, active = $3,
         api_secret_cipher = $4, updated_at = now() where id = $5`,
        [label, measurement_id, active, cipher, id]
      );
    } else {
      await query(
        `update ga4_accounts set label = $1, measurement_id = $2, active = $3,
         updated_at = now() where id = $4`,
        [label, measurement_id, active, id]
      );
    }
  } else {
    if (!api_secret) throw new Error("api_secret required for new account");
    const cipher = await encryptSecret(api_secret);
    await query(
      `insert into ga4_accounts (label, measurement_id, api_secret_cipher, active)
       values ($1, $2, $3, $4)`,
      [label, measurement_id, cipher, active]
    );
  }
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function deleteGa4Account(id: string) {
  await requireUser();
  await query(`delete from ga4_accounts where id = $1`, [id]);
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function upsertMetaPixel(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim();
  const pixel_id = String(formData.get("pixel_id") ?? "").trim();
  const capi_token = String(formData.get("capi_token") ?? "").trim();
  const active =
    formData.get("active") === "on" || formData.get("active") === "true";

  if (!label || !pixel_id) throw new Error("label and pixel_id required");

  if (id) {
    if (capi_token && !capi_token.startsWith("••••")) {
      const cipher = await encryptSecret(capi_token);
      await query(
        `update meta_pixels set label = $1, pixel_id = $2, active = $3,
         capi_token_cipher = $4, updated_at = now() where id = $5`,
        [label, pixel_id, active, cipher, id]
      );
    } else {
      await query(
        `update meta_pixels set label = $1, pixel_id = $2, active = $3,
         updated_at = now() where id = $4`,
        [label, pixel_id, active, id]
      );
    }
  } else {
    if (!capi_token) throw new Error("capi_token required for new pixel");
    const cipher = await encryptSecret(capi_token);
    await query(
      `insert into meta_pixels (label, pixel_id, capi_token_cipher, active)
       values ($1, $2, $3, $4)`,
      [label, pixel_id, cipher, active]
    );
  }
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function deleteMetaPixel(id: string) {
  await requireUser();
  await query(`delete from meta_pixels where id = $1`, [id]);
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function upsertMetaAdAccount(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim();
  const ad_account_id = String(formData.get("ad_account_id") ?? "").trim();
  const ads_token = String(formData.get("ads_token") ?? "").trim();
  const active =
    formData.get("active") === "on" || formData.get("active") === "true";

  if (!label || !ad_account_id) {
    throw new Error("label and ad_account_id required");
  }

  if (id) {
    if (ads_token && !ads_token.startsWith("••••")) {
      const cipher = await encryptSecret(ads_token);
      await query(
        `update meta_ad_accounts set label = $1, ad_account_id = $2, active = $3,
         ads_token_cipher = $4, updated_at = now() where id = $5`,
        [label, ad_account_id, active, cipher, id]
      );
    } else {
      await query(
        `update meta_ad_accounts set label = $1, ad_account_id = $2, active = $3,
         updated_at = now() where id = $4`,
        [label, ad_account_id, active, id]
      );
    }
  } else {
    if (!ads_token) throw new Error("ads_token required for new account");
    const cipher = await encryptSecret(ads_token);
    await query(
      `insert into meta_ad_accounts (label, ad_account_id, ads_token_cipher, active)
       values ($1, $2, $3, $4)`,
      [label, ad_account_id, cipher, active]
    );
  }
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function deleteMetaAdAccount(id: string) {
  await requireUser();
  await query(`delete from meta_ad_accounts where id = $1`, [id]);
  revalidatePath("/dashboard/config");
  return { ok: true as const };
}

export async function testMetaPixel(id: string) {
  await requireUser();
  const settings = await queryOne<Pick<SettingsRow, "test_event_code">>(
    `select test_event_code from settings where id = 1 limit 1`
  );
  const pixel = await queryOne<MetaPixelRow>(
    `select * from meta_pixels where id = $1 limit 1`,
    [id]
  );
  if (!pixel?.capi_token_cipher) {
    return { ok: false as const, error: "missing_token" };
  }

  return sendCapiToPixel({
    pixelId: pixel.pixel_id,
    tokenCipher: pixel.capi_token_cipher,
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
}

export async function testGa4Account(id: string) {
  await requireUser();
  const account = await queryOne<Ga4AccountRow>(
    `select * from ga4_accounts where id = $1 limit 1`,
    [id]
  );
  if (!account?.api_secret_cipher) {
    return { ok: false as const, error: "missing_secret" };
  }

  const secret = await decryptSecret(account.api_secret_cipher);
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
  const account = await queryOne<MetaAdAccountRow>(
    `select * from meta_ad_accounts where id = $1 limit 1`,
    [id]
  );
  if (!account?.ads_token_cipher) {
    return { ok: false as const, error: "missing_token" };
  }

  const token = await decryptSecret(account.ads_token_cipher);
  const actId = account.ad_account_id.replace(/^act_/, "");
  const url = `${META_GRAPH_BASE_URL}/act_${actId}?fields=id,name,account_status&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, response: body };
}
