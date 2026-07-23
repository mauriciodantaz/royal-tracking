import { hashEmail, hashPhone, hashPii } from "@/lib/tracking/hash";

/** Meta Conversions API action_source values we emit. */
export type MetaActionSource = "website" | "business_messaging";

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
  /** Click-to-WhatsApp click id — do NOT hash */
  ctwaClid?: string | null;
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
  /** Defaults to website (site/forms/purchase). Use business_messaging for CTWA. */
  actionSource?: MetaActionSource;
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
  // Do NOT hash fbp / fbc / ctwa_clid / ip / ua
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  if (u.ctwaClid) out.ctwa_clid = u.ctwaClid;
  if (u.clientIpAddress) out.client_ip_address = u.clientIpAddress;
  if (u.clientUserAgent) out.client_user_agent = u.clientUserAgent;

  return out;
}

export function buildCapiPayload(input: MetaEventInput) {
  const actionSource: MetaActionSource = input.actionSource ?? "website";
  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: actionSource,
    user_data: buildUserData(input.userData),
  };
  // Meta requires messaging_channel when action_source is business_messaging
  // (error_subcode 2804063). Valid: messenger | whatsapp | instagram.
  if (actionSource === "business_messaging") {
    event.messaging_channel = "whatsapp";
  }
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
