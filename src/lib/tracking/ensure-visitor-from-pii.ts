import "server-only";

import { queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import type { MetaUserData } from "@/lib/meta/capi";
import { resolveConversionAttribution } from "@/lib/tracking/attribution";
import {
  hashEmail,
  hashPhone,
  hashPii,
  newTrckUserId,
} from "@/lib/tracking/hash";
import { matchAndMergeVisitor } from "@/lib/tracking/match";
import { resolveAndPersistGaClientId } from "@/lib/tracking/persist-ga-client-id";
import type {
  GaClientIdSource,
  ResolveGaIdentityResult,
} from "@/lib/tracking/ga-client-id";

export type CrmIdentity = {
  visitor: VisitorRow | null;
  trckUserId: string | null;
  gaResolved: ResolveGaIdentityResult;
  attr: ReturnType<typeof resolveConversionAttribution>;
  match: Awaited<ReturnType<typeof matchAndMergeVisitor>>;
  userData: MetaUserData;
};

async function insertVisitorFromPii(opts: {
  email: string | null;
  phone: string | null;
  name: string | null;
}): Promise<VisitorRow | null> {
  const trckUserId = newTrckUserId();
  const first = opts.name?.split(/\s+/)[0] ?? null;
  const last = opts.name?.split(/\s+/).slice(1).join(" ") || null;
  return queryOne<VisitorRow>(
    `insert into visitors (
       trck_user_id, email, email_hash, phone_hash,
       first_name_hash, last_name_hash, external_id_hash
     ) values ($1,$2,$3,$4,$5,$6,$7)
     returning *`,
    [
      trckUserId,
      opts.email?.trim() || null,
      hashEmail(opts.email),
      hashPhone(opts.phone),
      hashPii(first),
      hashPii(last),
      hashPii(trckUserId),
    ]
  );
}

function buildUserData(opts: {
  email: string | null;
  phone: string | null;
  name: string | null;
  visitor: VisitorRow | null;
  trckUserId: string | null;
  attr: ReturnType<typeof resolveConversionAttribution>;
}): MetaUserData {
  const { email, phone, name, visitor, trckUserId, attr } = opts;
  return {
    email: email ?? visitor?.email,
    emailHash: hashEmail(email) ?? visitor?.email_hash,
    phoneHash: hashPhone(phone) ?? visitor?.phone_hash,
    firstNameHash:
      hashPii(name?.split(/\s+/)[0]) ?? visitor?.first_name_hash,
    lastNameHash:
      hashPii(name?.split(/\s+/).slice(1).join(" ")) ??
      visitor?.last_name_hash,
    cityHash: visitor?.city_hash,
    stateHash: visitor?.state_hash,
    countryHash: visitor?.country_hash,
    externalId: trckUserId,
    externalIdHash:
      visitor?.external_id_hash ?? (trckUserId ? hashPii(trckUserId) : null),
    fbp: attr.fbp,
    fbc: attr.fbc,
    ctwaClid: attr.ctwa_clid,
    clientIpAddress: visitor?.ip,
    clientUserAgent: visitor?.user_agent,
  };
}

/**
 * Match a CRM contact to a visitor, or create one from e-mail/phone.
 * Always resolves a GA4 client_id (synthetic from dealId when there is no PII).
 */
export async function ensureVisitorFromPii(opts: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  dealId: string;
}): Promise<CrmIdentity> {
  const email = opts.email?.trim() || null;
  const phone = opts.phone?.trim() || null;
  const name = opts.name?.trim() || null;

  let match = await matchAndMergeVisitor({ email, phone });
  let visitor = match.visitor;

  if (!visitor && (email || phone)) {
    visitor = await insertVisitorFromPii({ email, phone, name });
    if (visitor) {
      match = {
        visitor,
        match_status: "unmatched",
        match_reason: "created_from_crm",
      };
    }
  }

  const trckUserId = visitor?.trck_user_id ?? null;
  const syntheticSeed = trckUserId || `crmdeal:${opts.dealId}`;
  const gaResolved = await resolveAndPersistGaClientId({
    stored: visitor?.ga_client_id,
    storedSource: (visitor?.ga_client_id_source as GaClientIdSource | null) ?? null,
    storedBrowserGa: visitor?.browser_ga_client_id,
    trckUserId: syntheticSeed,
    visitorCreatedAt: visitor?.created_at,
  });
  const attr = resolveConversionAttribution(visitor);
  return {
    visitor,
    trckUserId,
    gaResolved,
    attr,
    match,
    userData: buildUserData({
      email,
      phone,
      name,
      visitor,
      trckUserId,
      attr,
    }),
  };
}
