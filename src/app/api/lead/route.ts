import { createHash } from "node:crypto";

import { type NextRequest } from "next/server";

import { corsPreflight, jsonCors } from "@/lib/cors";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { FormRow, VisitorRow } from "@/lib/db/types";
import { dispatchEvent } from "@/lib/integrations/dispatch";
import { getSnippetConnection } from "@/lib/integrations/connections";
import { rateLimit } from "@/lib/rate-limit/memory";
import {
  hashEmail,
  hashPhone,
  hashPii,
  newEventId,
  newTrckUserId,
} from "@/lib/tracking/hash";
import { getClientIp, getUserAgent } from "@/lib/tracking/request";
import { leadSchema } from "@/lib/tracking/schemas";

export const runtime = "nodejs";

export function OPTIONS() {
  return corsPreflight();
}

function fingerprintForm(input: {
  action?: string;
  label?: string;
  fieldNames: string[];
  pageUrl?: string;
}): string {
  const raw = [
    input.action ?? "",
    input.label ?? "",
    input.fieldNames.slice().sort().join(","),
    input.pageUrl ? new URL(input.pageUrl).pathname : "",
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function pickEmailPhoneName(fields: Record<string, string>) {
  let email: string | undefined;
  let phone: string | undefined;
  let name: string | undefined;
  for (const [k, v] of Object.entries(fields)) {
    const key = k.toLowerCase();
    const val = String(v).trim();
    if (!val) continue;
    if (!email && (key.includes("email") || key.includes("e-mail"))) {
      email = val;
    } else if (
      !phone &&
      (key.includes("phone") ||
        key.includes("tel") ||
        key.includes("whats") ||
        key.includes("celular"))
    ) {
      phone = val;
    } else if (
      !name &&
      (key === "name" ||
        key.includes("nome") ||
        key.includes("full_name") ||
        key.includes("fullname"))
    ) {
      name = val;
    }
  }
  return { email, phone, name };
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limited = rateLimit(`lead:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return jsonCors(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
      }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonCors({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(json);
  if (!parsed.success) {
    return jsonCors(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const fieldsRaw = body.fields ?? {};
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(fieldsRaw)) {
    fields[k] = String(v);
  }
  const picked = pickEmailPhoneName(fields);
  const email = body.email ?? picked.email;
  const phone = body.phone ?? picked.phone;
  const name = body.name ?? picked.name;
  const fieldNames = Object.keys(fields);
  const fp =
    body.form_fingerprint ??
    fingerprintForm({
      action: body.form_action,
      label: body.form_label,
      fieldNames,
      pageUrl: body.page_url,
    });
  const eventName = body.event_name ?? "Lead";
  const eventId = body.event_id ?? newEventId();
  const trckUserId = body.trck_user_id ?? newTrckUserId();
  const userAgent = getUserAgent(request);

  try {
    await ensureDbReady();
    const snippet = await getSnippetConnection();

    let form = await queryOne<FormRow>(
      `select * from forms where fingerprint = $1 limit 1`,
      [fp]
    );
    if (!form) {
      form = await queryOne<FormRow>(
        `insert into forms (fingerprint, label, page_url, field_names, default_event_name, submission_count)
         values ($1, $2, $3, $4::jsonb, $5, 1)
         returning *`,
        [
          fp,
          body.form_label || body.form_action || `Form ${fp.slice(0, 8)}`,
          body.page_url ?? null,
          JSON.stringify(fieldNames),
          eventName,
        ]
      );
    } else {
      await query(
        `update forms set submission_count = submission_count + 1,
           field_names = $2::jsonb, updated_at = now()
         where id = $1`,
        [form.id, JSON.stringify(fieldNames)]
      );
    }

    // Upsert visitor with PII
    await query(
      `insert into visitors (
         trck_user_id, email, email_hash, phone_hash, external_id_hash,
         fbp, fbc, ga_client_id,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         ip, user_agent
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (trck_user_id) do update set
         email = coalesce(excluded.email, visitors.email),
         email_hash = coalesce(excluded.email_hash, visitors.email_hash),
         phone_hash = coalesce(excluded.phone_hash, visitors.phone_hash),
         fbp = coalesce(excluded.fbp, visitors.fbp),
         fbc = coalesce(excluded.fbc, visitors.fbc),
         ga_client_id = coalesce(excluded.ga_client_id, visitors.ga_client_id),
         utm_source = coalesce(excluded.utm_source, visitors.utm_source),
         utm_medium = coalesce(excluded.utm_medium, visitors.utm_medium),
         utm_campaign = coalesce(excluded.utm_campaign, visitors.utm_campaign),
         utm_term = coalesce(excluded.utm_term, visitors.utm_term),
         utm_content = coalesce(excluded.utm_content, visitors.utm_content),
         ip = coalesce(excluded.ip, visitors.ip),
         user_agent = coalesce(excluded.user_agent, visitors.user_agent),
         updated_at = now()`,
      [
        trckUserId,
        email ?? null,
        hashEmail(email),
        hashPhone(phone),
        hashPii(trckUserId),
        body.fbp ?? null,
        body.fbc ?? null,
        body.ga_client_id ?? null,
        body.utm_source ?? null,
        body.utm_medium ?? null,
        body.utm_campaign ?? null,
        body.utm_term ?? null,
        body.utm_content ?? null,
        ip,
        userAgent,
      ]
    );

    const visitor = await queryOne<VisitorRow>(
      `select * from visitors where trck_user_id = $1 limit 1`,
      [trckUserId]
    );

    const lead = await queryOne<{ id: string }>(
      `insert into form_leads (
         form_id, trck_user_id, email, phone, email_hash, phone_hash, name,
         fields, page_url,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         fbp, fbc, ga_client_id, source_provider, source_connection_id,
         consent, raw_payload, event_id, match_status
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23
       )
       on conflict (event_id) do nothing
       returning id`,
      [
        form?.id ?? null,
        trckUserId,
        email ?? null,
        phone ?? null,
        hashEmail(email),
        hashPhone(phone),
        name ?? null,
        JSON.stringify(fields),
        body.page_url ?? null,
        body.utm_source ?? visitor?.utm_source ?? null,
        body.utm_medium ?? visitor?.utm_medium ?? null,
        body.utm_campaign ?? visitor?.utm_campaign ?? null,
        body.utm_term ?? visitor?.utm_term ?? null,
        body.utm_content ?? visitor?.utm_content ?? null,
        body.fbp ?? visitor?.fbp ?? null,
        body.fbc ?? visitor?.fbc ?? null,
        body.ga_client_id ?? visitor?.ga_client_id ?? null,
        "snippet",
        snippet?.id ?? null,
        body.consent ?? null,
        JSON.stringify(body),
        eventId,
        "matched",
      ]
    );

    const dispatch = await dispatchEvent({
      sourceProvider: "snippet",
      sourceConnectionId: snippet?.id,
      sourceEvent: eventName,
      eventId,
      eventSourceUrl: body.page_url,
      userData: {
        email: email ?? visitor?.email,
        emailHash: visitor?.email_hash ?? hashEmail(email),
        phoneHash: visitor?.phone_hash ?? hashPhone(phone),
        externalId: trckUserId,
        externalIdHash: visitor?.external_id_hash,
        fbp: body.fbp ?? visitor?.fbp,
        fbc: body.fbc ?? visitor?.fbc,
        clientIpAddress: visitor?.ip ?? ip,
        clientUserAgent: visitor?.user_agent ?? userAgent,
      },
      gaClientId: body.ga_client_id ?? visitor?.ga_client_id,
      gaSessionId: visitor?.ga_session_id,
    });

    await query(
      `insert into events_log (
         trck_user_id, event_name, event_id,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         payload_meta, response_meta, payload_ga4, response_ga4, ip
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,null,null,$11)
       on conflict (event_id) do nothing`,
      [
        trckUserId,
        eventName,
        eventId,
        body.utm_source ?? visitor?.utm_source ?? null,
        body.utm_medium ?? visitor?.utm_medium ?? null,
        body.utm_campaign ?? visitor?.utm_campaign ?? null,
        body.utm_term ?? visitor?.utm_term ?? null,
        body.utm_content ?? visitor?.utm_content ?? null,
        JSON.stringify(dispatch.results.map((r) => r.payload)),
        JSON.stringify(dispatch.results),
        ip,
      ]
    );

    return jsonCors({
      ok: true,
      lead_id: lead?.id ?? null,
      form_id: form?.id ?? null,
      trck_user_id: trckUserId,
      event_id: eventId,
      dispatch: {
        targets: dispatch.targets,
        results: dispatch.results.map((r) => ({
          connection_id: r.connectionId,
          provider: r.provider,
          ok: r.ok,
          status: r.status,
          error: r.error,
        })),
      },
    });
  } catch (err) {
    return jsonCors(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}
