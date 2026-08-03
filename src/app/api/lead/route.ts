import { type NextRequest } from "next/server";

import { corsPreflight, guardPublicTrackingOrigin, jsonCors } from "@/lib/cors";
import { ensureDbReady } from "@/lib/db/boot";
import { isUniqueViolation, query, queryOne } from "@/lib/db/pool";
import type { FormRow, VisitorRow } from "@/lib/db/types";
import { dispatchEvent } from "@/lib/integrations/dispatch";
import { getSnippetConnection } from "@/lib/integrations/connections";
import { logAndPublicError, publicErrorBody } from "@/lib/http/public-error";
import { rateLimit } from "@/lib/rate-limit";
import {
  classifyChannel,
  clientWebFromBody,
  serverFlagsFromDispatch,
} from "@/lib/tracking/channel";
import { resolveGaIdentity } from "@/lib/tracking/ga-client-id";
import { captureFirstTouchIfNeeded } from "@/lib/tracking/first-touch";
import {
  hashEmail,
  hashPhone,
  hashPii,
  newEventId,
  newTicketCode,
  newTrckUserId,
} from "@/lib/tracking/hash";
import { matchAndMergeVisitor } from "@/lib/tracking/match";
import { getClientIp, getUserAgent } from "@/lib/tracking/request";
import {
  appendRtFpidCookie,
  readRtFpidFromRequest,
} from "@/lib/tracking/rt-fpid-cookie";
import { canonicalUrl } from "@/lib/tracking/canonical-url";
import {
  fingerprintForm,
  formSamplePageUrl,
  normalizeFormLabel,
} from "@/lib/tracking/form-fingerprint";
import {
  pickEmailPhoneNameFromClassification,
  type FieldClassification,
  type FieldKind,
} from "@/lib/tracking/form-field-classifier";
import { leadSchema } from "@/lib/tracking/schemas";
import { loadSnippetSettings } from "@/lib/tracking/snippet-config";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

function normalizeClientHints(
  raw: LeadHints | undefined
): FieldClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const out: FieldClassification = {};
  for (const [kind, meta] of Object.entries(raw)) {
    if (!meta || typeof meta !== "object" || !("key" in meta)) continue;
    const key = String((meta as { key?: string }).key || "");
    if (!key) continue;
    out[kind as FieldKind] = {
      key,
      score: Number((meta as { score?: number }).score) || 0,
    };
  }
  return out;
}

type LeadHints = Record<string, { key?: string; score?: number }>;

export async function POST(request: NextRequest) {
  const forbidden = guardPublicTrackingOrigin(request);
  if (forbidden) return forbidden;

  const ip = getClientIp(request);
  const limited = rateLimit(`lead:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return jsonCors(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
      },
      request
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonCors({ error: "invalid_json" }, { status: 400 }, request);
  }

  const parsed = leadSchema.safeParse(json);
  if (!parsed.success) {
    return jsonCors(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
      request
    );
  }

  const body = parsed.data;
  const fieldsRaw = body.fields ?? {};
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(fieldsRaw)) {
    fields[k] = String(v);
  }
  const clientHints = normalizeClientHints(
    body.field_classification as LeadHints | undefined
  );
  const picked = pickEmailPhoneNameFromClassification(fields, clientHints);
  const email = (body.email ?? picked.email)?.trim() || undefined;
  const phone = (body.phone ?? picked.phone)?.trim() || undefined;
  const name = body.name ?? picked.name;
  if (!email && !phone) {
    return jsonCors({ ok: true, skipped: "no_contact" }, { status: 200 }, request);
  }
  const fieldNames = Object.keys(fields);
  // Server-authoritative: ignore client form_fingerprint so ?query never splits forms.
  const fp = fingerprintForm({
    action: body.form_action,
    label: body.form_label,
    fieldNames,
    pageUrl: body.page_url,
  });
  const eventName = body.event_name ?? "Lead";
  const eventId = body.event_id ?? newEventId();
  let trckUserId = body.trck_user_id ?? newTrckUserId();
  const userAgent = getUserAgent(request);
  const { webMeta, webGa4 } = clientWebFromBody(body.client_web);

  try {
    await ensureDbReady();
    const snippet = await getSnippetConnection();
    const snippetSettings = await loadSnippetSettings();
    const resolvedCanonical =
      body.canonical_url ||
      canonicalUrl(body.page_url, {
        preserveParams: snippetSettings.url_preserve_params,
      });

    const rawLabel =
      body.form_label || body.form_action || `Form ${fp.slice(0, 8)}`;
    const formLabel = normalizeFormLabel(rawLabel) || rawLabel;
    const sampleUrl = formSamplePageUrl(body.page_url);

    let form = await queryOne<FormRow>(
      `select * from forms where fingerprint = $1 limit 1`,
      [fp]
    );
    let formCountUpdated = false;

    // Reclaim legacy rows (old fingerprint included page path / query in label).
    if (!form) {
      const legacy = await queryOne<FormRow>(
        `select * from forms
         where field_names = $1::jsonb
           and (
             label = $2
             or label = $3
             or split_part(coalesce(label, ''), '?', 1) = $3
           )
         order by submission_count desc
         limit 1`,
        [
          JSON.stringify(fieldNames),
          body.form_label ?? formLabel,
          formLabel,
        ]
      );
      if (legacy) {
        try {
          form = await queryOne<FormRow>(
            `update forms
             set fingerprint = $1,
                 label = $2,
                 page_url = coalesce($3, page_url),
                 submission_count = submission_count + 1,
                 field_names = $4::jsonb,
                 field_classification = $5::jsonb,
                 updated_at = now()
             where id = $6
             returning *`,
            [
              fp,
              formLabel,
              sampleUrl,
              JSON.stringify(fieldNames),
              JSON.stringify(picked.classification),
              legacy.id,
            ]
          );
          formCountUpdated = Boolean(form);
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
          // New fingerprint already taken — keep that row.
          form = await queryOne<FormRow>(
            `select * from forms where fingerprint = $1 limit 1`,
            [fp]
          );
        }
      }
    }

    if (!form) {
      form = await queryOne<FormRow>(
        `insert into forms (
           fingerprint, label, page_url, field_names, field_classification,
           default_event_name, submission_count
         )
         values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, 1)
         returning *`,
        [
          fp,
          formLabel,
          sampleUrl,
          JSON.stringify(fieldNames),
          JSON.stringify(picked.classification),
          eventName,
        ]
      );
      formCountUpdated = Boolean(form);
    } else if (!formCountUpdated) {
      await query(
        `update forms set submission_count = submission_count + 1,
           field_names = $2::jsonb,
           field_classification = $3::jsonb,
           page_url = coalesce($4, page_url),
           updated_at = now()
         where id = $1`,
        [
          form.id,
          JSON.stringify(fieldNames),
          JSON.stringify(picked.classification),
          sampleUrl,
        ]
      );
    }

    const existingVisitor = await queryOne<
      Pick<
        VisitorRow,
        | "ga_client_id"
        | "ga_client_id_source"
        | "browser_ga_client_id"
        | "created_at"
      >
    >(
      `select ga_client_id, ga_client_id_source, browser_ga_client_id, created_at
       from visitors where trck_user_id = $1 limit 1`,
      [trckUserId]
    );
    const gaResolved = resolveGaIdentity({
      fromBrowserGa: body.ga_client_id,
      fromRtFpid: readRtFpidFromRequest(request),
      storedClientId: existingVisitor?.ga_client_id,
      storedSource: existingVisitor?.ga_client_id_source,
      storedBrowserGa: existingVisitor?.browser_ga_client_id,
      trckUserId,
      visitorCreatedAt: existingVisitor?.created_at ?? new Date(),
    });

    await query(
      `insert into visitors (
         trck_user_id, ticket_code, email, email_hash, phone_hash, external_id_hash,
         fbp, fbc, ga_client_id, ga_client_id_source, browser_ga_client_id,
         ga_client_id_created_at, ga_client_id_updated_at,
         gclid, ttclid, ctwa_clid, wbraid, gbraid,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         ip, user_agent
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
         case when $9::text is not null then now() else null end,
         case when $9::text is not null then now() else null end,
         $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       )
       on conflict (trck_user_id) do update set
         ticket_code = coalesce(visitors.ticket_code, excluded.ticket_code),
         email = coalesce(excluded.email, visitors.email),
         email_hash = coalesce(excluded.email_hash, visitors.email_hash),
         phone_hash = coalesce(excluded.phone_hash, visitors.phone_hash),
         fbp = coalesce(excluded.fbp, visitors.fbp),
         fbc = coalesce(excluded.fbc, visitors.fbc),
         ga_client_id = coalesce(visitors.ga_client_id, excluded.ga_client_id),
         ga_client_id_source = coalesce(visitors.ga_client_id_source, excluded.ga_client_id_source),
         browser_ga_client_id = coalesce(excluded.browser_ga_client_id, visitors.browser_ga_client_id),
         ga_client_id_created_at = coalesce(visitors.ga_client_id_created_at, excluded.ga_client_id_created_at),
         ga_client_id_updated_at = case
           when excluded.ga_client_id is not null or excluded.browser_ga_client_id is not null
           then now() else visitors.ga_client_id_updated_at end,
         gclid = coalesce(excluded.gclid, visitors.gclid),
         ttclid = coalesce(excluded.ttclid, visitors.ttclid),
         ctwa_clid = coalesce(excluded.ctwa_clid, visitors.ctwa_clid),
         wbraid = coalesce(excluded.wbraid, visitors.wbraid),
         gbraid = coalesce(excluded.gbraid, visitors.gbraid),
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
        newTicketCode(),
        email ?? null,
        hashEmail(email),
        hashPhone(phone),
        hashPii(trckUserId),
        body.fbp ?? null,
        body.fbc ?? null,
        gaResolved.clientId,
        gaResolved.source === "none" ? null : gaResolved.source,
        gaResolved.browserGaClientId,
        body.gclid ?? null,
        body.ttclid ?? null,
        body.ctwa_clid ?? null,
        body.wbraid ?? null,
        body.gbraid ?? null,
        body.utm_source ?? null,
        body.utm_medium ?? null,
        body.utm_campaign ?? null,
        body.utm_term ?? null,
        body.utm_content ?? null,
        ip,
        userAgent,
      ]
    );

    const merged = await matchAndMergeVisitor({
      trck_user_id: trckUserId,
      email,
      phone,
    });
    if (merged.visitor?.trck_user_id) {
      trckUserId = merged.visitor.trck_user_id;
    }

    await captureFirstTouchIfNeeded({
      trckUserId,
      hasPii: Boolean(email || phone),
      snapshot: {
        utm_source: body.utm_source,
        utm_medium: body.utm_medium,
        utm_campaign: body.utm_campaign,
        utm_term: body.utm_term,
        utm_content: body.utm_content,
        fbp: body.fbp,
        fbc: body.fbc,
        gclid: body.gclid,
        ttclid: body.ttclid,
        ctwa_clid: body.ctwa_clid,
        wbraid: body.wbraid,
        gbraid: body.gbraid,
      },
    });

    const visitor =
      merged.visitor ??
      (await queryOne<VisitorRow>(
        `select * from visitors where trck_user_id = $1 limit 1`,
        [trckUserId]
      ));

    const emailHash = hashEmail(email);
    const phoneHash = hashPhone(phone);

    // Soft-dedup: mesmo visitante + mesmo email/telefone em janela curta
    // (snippet carregado 2x ou capture + trck.lead com event_ids diferentes).
    if (emailHash || phoneHash) {
      const recent = await queryOne<{ id: string; event_id: string | null }>(
        `select id, event_id from form_leads
         where trck_user_id = $1
           and created_at > now() - interval '10 seconds'
           and (
             ($2::text is not null and email_hash = $2)
             or ($2::text is null and $3::text is not null and phone_hash = $3)
           )
         order by created_at desc
         limit 1`,
        [trckUserId, emailHash, phoneHash]
      );
      if (recent) {
        return jsonCors(
          {
            ok: true,
            lead_id: recent.id,
            form_id: form?.id ?? null,
            trck_user_id: trckUserId,
            event_id: recent.event_id ?? eventId,
            deduped: true,
          },
          undefined,
          request
        );
      }
    }

    const provisionalClass = classifyChannel({
      webMeta,
      webGa4,
      serverMeta: false,
      serverGa4: false,
    });

    try {
      await query(
        `insert into events_log (
           trck_user_id, event_name, event_id,
           utm_source, utm_medium, utm_campaign, utm_term, utm_content,
           ip, ingest_path, web_meta, web_ga4, server_meta, server_ga4, channel_class
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'snippet',$10,$11,false,false,$12)`,
        [
          trckUserId,
          eventName,
          eventId,
          body.utm_source ?? visitor?.utm_source ?? null,
          body.utm_medium ?? visitor?.utm_medium ?? null,
          body.utm_campaign ?? visitor?.utm_campaign ?? null,
          body.utm_term ?? visitor?.utm_term ?? null,
          body.utm_content ?? visitor?.utm_content ?? null,
          ip,
          webMeta,
          webGa4,
          provisionalClass,
        ]
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        return jsonCors(
          {
            ok: true,
            lead_id: null,
            form_id: form?.id ?? null,
            trck_user_id: trckUserId,
            event_id: eventId,
            deduped: true,
          },
          undefined,
          request
        );
      }
      throw err;
    }

    const lead = await queryOne<{ id: string }>(
      `insert into form_leads (
         form_id, trck_user_id, email, phone, email_hash, phone_hash, name,
         fields, page_url, canonical_url,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         fbp, fbc, gclid, ttclid, ctwa_clid, ga_client_id,
         source_provider, source_connection_id,
         consent, raw_payload, event_id, match_status
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,
         $17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,$26,$27
       )
       on conflict (event_id) do nothing
       returning id`,
      [
        form?.id ?? null,
        trckUserId,
        email ?? null,
        phone ?? null,
        emailHash,
        phoneHash,
        name ?? null,
        JSON.stringify(fields),
        body.page_url ?? null,
        resolvedCanonical,
        body.utm_source ?? visitor?.utm_source ?? null,
        body.utm_medium ?? visitor?.utm_medium ?? null,
        body.utm_campaign ?? visitor?.utm_campaign ?? null,
        body.utm_term ?? visitor?.utm_term ?? null,
        body.utm_content ?? visitor?.utm_content ?? null,
        body.fbp ?? visitor?.fbp ?? null,
        body.fbc ?? visitor?.fbc ?? null,
        body.gclid ?? visitor?.gclid ?? null,
        body.ttclid ?? visitor?.ttclid ?? null,
        body.ctwa_clid ?? visitor?.ctwa_clid ?? null,
        gaResolved.clientId,
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
        ctwaClid: body.ctwa_clid ?? visitor?.ctwa_clid,
        clientIpAddress: visitor?.ip ?? ip,
        clientUserAgent: visitor?.user_agent ?? userAgent,
      },
      gaClientId: gaResolved.clientId,
      gaClientIdSource: gaResolved.source,
      gaIdentityMeta: gaResolved.meta,
      gaSessionId: visitor?.ga_session_id,
      gclid: body.gclid ?? visitor?.gclid,
      wbraid: body.wbraid ?? visitor?.wbraid,
      gbraid: body.gbraid ?? visitor?.gbraid,
    });

    const { serverMeta, serverGa4 } = serverFlagsFromDispatch(dispatch.results);
    const channelClass = classifyChannel({
      webMeta,
      webGa4,
      serverMeta,
      serverGa4,
    });

    await query(
      `update events_log set
         payload_meta = $1::jsonb,
         response_meta = $2::jsonb,
         payload_ga4 = $3::jsonb,
         response_ga4 = $4::jsonb,
         server_meta = $5,
         server_ga4 = $6,
         channel_class = $7
       where event_id = $8`,
      [
        JSON.stringify(
          dispatch.results
            .filter((r) => r.provider === "meta_pixel")
            .map((r) => r.payload)
        ),
        JSON.stringify(
          dispatch.results.filter((r) => r.provider === "meta_pixel")
        ),
        JSON.stringify(
          dispatch.results
            .filter((r) => r.provider === "ga4")
            .map((r) => r.payload)
        ),
        JSON.stringify(dispatch.results.filter((r) => r.provider === "ga4")),
        serverMeta,
        serverGa4,
        channelClass,
        eventId,
      ]
    );

    const response = jsonCors(
      {
        ok: true,
        lead_id: lead?.id ?? null,
        form_id: form?.id ?? null,
        trck_user_id: trckUserId,
        event_id: eventId,
        channel_class: channelClass,
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
      },
      undefined,
      request
    );
    if (gaResolved.writeCookie && gaResolved.clientId) {
      appendRtFpidCookie(response, gaResolved.clientId);
    }
    return response;
  } catch (err) {
    logAndPublicError("api/lead", err);
    return jsonCors(publicErrorBody("internal"), { status: 500 }, request);
  }
}
