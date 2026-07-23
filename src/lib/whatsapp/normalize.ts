/** Normalize Evolution / UazAPI / RD Conversas inbound payloads into a common shape. */

export type WhatsappInboundProvider =
  | "evolution_api"
  | "uazapi"
  | "rdstation_conversas";

export type WhatsappReferral = {
  ctwaClid: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
};

export type NormalizedWhatsappMessage = {
  phone: string | null;
  pushName: string | null;
  text: string;
  messageId: string;
  fromMe: boolean;
  isGroup: boolean;
  timestamp: number;
  provider: WhatsappInboundProvider;
  ctwaClid: string | null;
  referralSourceId: string | null;
  referralSourceUrl: string | null;
  referralSourceType: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function digitsPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/@.*$/, "");
  s = s.replace(/\D/g, "");
  if (s.length < 8) return null;
  return s;
}

function extractTextFromMessageObj(msg: Record<string, unknown> | null): string {
  if (!msg) return "";
  if (typeof msg.conversation === "string") return msg.conversation;
  const ext = asRecord(msg.extendedTextMessage);
  if (ext && typeof ext.text === "string") return ext.text;
  const img = asRecord(msg.imageMessage);
  if (img && typeof img.caption === "string") return img.caption;
  const vid = asRecord(msg.videoMessage);
  if (vid && typeof vid.caption === "string") return vid.caption;
  const btn = asRecord(msg.buttonsResponseMessage);
  if (btn && typeof btn.selectedDisplayText === "string") {
    return btn.selectedDisplayText;
  }
  const list = asRecord(msg.listResponseMessage);
  if (list && typeof list.title === "string") return list.title;
  return "";
}

function jidIsGroup(jid: string | null | undefined): boolean {
  if (!jid) return false;
  return jid.includes("@g.us") || jid.includes("@newsletter");
}

function strField(
  obj: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Parse Meta-style referral object (Official API / mirrored by middlewares). */
export function parseReferralObject(raw: unknown): WhatsappReferral {
  const empty: WhatsappReferral = {
    ctwaClid: null,
    sourceId: null,
    sourceUrl: null,
    sourceType: null,
  };
  const ref = asRecord(raw);
  if (!ref) return empty;
  return {
    ctwaClid: strField(ref, "ctwa_clid", "ctwaClid", "ctwaClId"),
    sourceId: strField(ref, "source_id", "sourceId"),
    sourceUrl: strField(ref, "source_url", "sourceUrl"),
    sourceType: strField(ref, "source_type", "sourceType"),
  };
}

/**
 * Deep-scan common nesting for referral / ctwa_clid (Evolution, UazAPI, wrappers).
 */
export function extractReferralFromRaw(raw: unknown): WhatsappReferral {
  const empty: WhatsappReferral = {
    ctwaClid: null,
    sourceId: null,
    sourceUrl: null,
    sourceType: null,
  };
  if (!raw || typeof raw !== "object") return empty;

  const queue: unknown[] = [raw];
  const seen = new Set<unknown>();
  let best: WhatsappReferral = empty;

  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);

    if (Array.isArray(cur)) {
      for (const item of cur.slice(0, 40)) queue.push(item);
      continue;
    }

    const rec = cur as Record<string, unknown>;
    if (rec.referral) {
      const parsed = parseReferralObject(rec.referral);
      if (parsed.ctwaClid || parsed.sourceId) {
        return parsed;
      }
    }
    const directClid = strField(rec, "ctwa_clid", "ctwaClid", "ctwaClId");
    if (directClid && !best.ctwaClid) {
      best = {
        ctwaClid: directClid,
        sourceId: strField(rec, "source_id", "sourceId") ?? best.sourceId,
        sourceUrl: strField(rec, "source_url", "sourceUrl") ?? best.sourceUrl,
        sourceType: strField(rec, "source_type", "sourceType") ?? best.sourceType,
      };
    }

    const ctx = asRecord(rec.contextInfo) ?? asRecord(rec.context_info);
    if (ctx) {
      const external = asRecord(ctx.externalAdReply) ?? asRecord(ctx.external_ad_reply);
      if (external) {
        const clid = strField(
          external,
          "ctwa_clid",
          "ctwaClid",
          "sourceId",
          "source_id"
        );
        if (clid && (clid.length > 20 || strField(external, "ctwa_clid"))) {
          const fromExt = parseReferralObject({
            ctwa_clid: strField(external, "ctwa_clid", "ctwaClid"),
            source_id: strField(external, "source_id", "sourceId"),
            source_url: strField(external, "source_url", "sourceUrl", "sourceUrl"),
            source_type: strField(external, "source_type", "sourceType") ?? "ad",
          });
          if (fromExt.ctwaClid) return fromExt;
        }
      }
      queue.push(ctx);
    }

    for (const v of Object.values(rec)) {
      if (v && typeof v === "object") queue.push(v);
    }
    if (seen.size > 200) break;
  }

  return best;
}

function withReferral(
  base: Omit<
    NormalizedWhatsappMessage,
    | "ctwaClid"
    | "referralSourceId"
    | "referralSourceUrl"
    | "referralSourceType"
  >,
  referral: WhatsappReferral
): NormalizedWhatsappMessage {
  return {
    ...base,
    ctwaClid: referral.ctwaClid,
    referralSourceId: referral.sourceId,
    referralSourceUrl: referral.sourceUrl,
    referralSourceType: referral.sourceType,
  };
}

/** Evolution API messages.upsert (and similar wrappers). */
export function normalizeEvolutionPayload(
  raw: unknown
): NormalizedWhatsappMessage | null {
  const root = asRecord(raw);
  if (!root) return null;

  const data = asRecord(root.data) ?? root;
  const key = asRecord(data.key);
  if (!key) return null;

  const remoteJid =
    typeof key.remoteJid === "string"
      ? key.remoteJid
      : typeof key.remoteJidAlt === "string"
        ? key.remoteJidAlt
        : null;
  const fromMe = Boolean(key.fromMe);
  const messageId =
    typeof key.id === "string" && key.id
      ? key.id
      : typeof data.id === "string"
        ? data.id
        : "";
  if (!messageId) return null;

  const msg = asRecord(data.message);
  let text = extractTextFromMessageObj(msg);
  if (!text && typeof data.body === "string") text = data.body;

  const pushName =
    typeof data.pushName === "string"
      ? data.pushName
      : typeof root.pushName === "string"
        ? root.pushName
        : null;

  const tsRaw = data.messageTimestamp ?? data.timestamp ?? root.date_time;
  let timestamp = Date.now();
  if (typeof tsRaw === "number") {
    timestamp = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
  } else if (typeof tsRaw === "string") {
    const n = Number(tsRaw);
    if (Number.isFinite(n)) timestamp = n < 1e12 ? n * 1000 : n;
    else {
      const d = Date.parse(tsRaw);
      if (Number.isFinite(d)) timestamp = d;
    }
  }

  const referral = extractReferralFromRaw(raw);

  return withReferral(
    {
      phone: digitsPhone(remoteJid),
      pushName,
      text: text.trim(),
      messageId,
      fromMe,
      isGroup: jidIsGroup(remoteJid),
      timestamp,
      provider: "evolution_api",
    },
    referral
  );
}

/** UazAPI Go message webhook. */
export function normalizeUazapiPayload(
  raw: unknown
): NormalizedWhatsappMessage | null {
  const root = asRecord(raw);
  if (!root) return null;

  const data = asRecord(root.data) ?? asRecord(root.message) ?? root;
  const event =
    typeof root.EventType === "string"
      ? root.EventType
      : typeof root.event === "string"
        ? root.event
        : typeof root.type === "string"
          ? root.type
          : "";

  // Ignore non-message events when clearly labeled
  if (
    event &&
    !/message/i.test(event) &&
    event !== "messages" &&
    !asRecord(root.message) &&
    typeof data.body !== "string" &&
    typeof data.text !== "string"
  ) {
    return null;
  }

  const chatId =
    (typeof data.chatid === "string" && data.chatid) ||
    (typeof data.chatId === "string" && data.chatId) ||
    (typeof data.from === "string" && data.from) ||
    (typeof data.sender === "string" && data.sender) ||
    (typeof data.phone === "string" && data.phone) ||
    null;

  const messageId =
    (typeof data.messageid === "string" && data.messageid) ||
    (typeof data.messageId === "string" && data.messageId) ||
    (typeof data.id === "string" && data.id) ||
    (typeof root.id === "string" && root.id) ||
    "";
  if (!messageId) return null;

  const fromMe = Boolean(
    data.fromMe ?? data.from_me ?? data.wasSentByApi ?? data.owner
  );

  const isGroup =
    Boolean(data.isGroup) ||
    Boolean(data.isGroupYes) ||
    Boolean(data.group) ||
    jidIsGroup(chatId);

  let text = "";
  if (typeof data.body === "string") text = data.body;
  else if (typeof data.text === "string") text = data.text;
  else if (typeof data.content === "string") text = data.content;
  else {
    const msg = asRecord(data.message);
    text = extractTextFromMessageObj(msg);
  }

  const pushName =
    (typeof data.pushName === "string" && data.pushName) ||
    (typeof data.senderName === "string" && data.senderName) ||
    (typeof data.notifyName === "string" && data.notifyName) ||
    (typeof data.name === "string" && data.name) ||
    null;

  const tsRaw = data.messageTimestamp ?? data.timestamp ?? root.timestamp;
  let timestamp = Date.now();
  if (typeof tsRaw === "number") {
    timestamp = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
  } else if (typeof tsRaw === "string") {
    const n = Number(tsRaw);
    if (Number.isFinite(n)) timestamp = n < 1e12 ? n * 1000 : n;
  }

  const referral = extractReferralFromRaw(raw);

  return withReferral(
    {
      phone: digitsPhone(chatId),
      pushName,
      text: text.trim(),
      messageId,
      fromMe,
      isGroup,
      timestamp,
      provider: "uazapi",
    },
    referral
  );
}

/**
 * Unwrap Tallos/RD Conversas body from common capture shapes (direct object,
 * single-element array, or n8n-style `{ body: { content, contact } }`).
 */
function unwrapRdConversasRoot(raw: unknown): Record<string, unknown> | null {
  let cur: unknown = raw;
  if (Array.isArray(cur)) {
    if (cur.length === 0) return null;
    cur = cur[0];
  }
  let root = asRecord(cur);
  if (!root) return null;

  const nestedBody = asRecord(root.body);
  if (nestedBody && (asRecord(nestedBody.content) || asRecord(nestedBody.contact))) {
    root = nestedBody;
  }
  return root;
}

/** RD Conversas (Tallos) inbound webhook — client messages only. */
export function normalizeRdConversasPayload(
  raw: unknown
): NormalizedWhatsappMessage | null {
  const root = unwrapRdConversasRoot(raw);
  if (!root) return null;

  const content = asRecord(root.content);
  const contact = asRecord(root.contact);
  if (!content || !contact) return null;

  const messageId =
    (typeof content.id === "string" && content.id) ||
    (typeof content.id === "number" && String(content.id)) ||
    "";
  if (!messageId) return null;

  const type = typeof content.type === "string" ? content.type : "text";
  if (type && type !== "text") return null;

  const text =
    typeof content.message === "string" ? content.message.trim() : "";
  if (!text) return null;

  const phone = digitsPhone(
    typeof contact.phone === "string" ? contact.phone : null
  );
  if (!phone) return null;

  const pushName =
    typeof contact.name === "string" && contact.name.trim()
      ? contact.name.trim()
      : null;

  const referral = extractReferralFromRaw(raw);

  return withReferral(
    {
      phone,
      pushName,
      text,
      messageId,
      fromMe: false,
      isGroup: false,
      timestamp: Date.now(),
      provider: "rdstation_conversas",
    },
    referral
  );
}

export function normalizeWhatsappPayload(
  provider: WhatsappInboundProvider,
  raw: unknown
): NormalizedWhatsappMessage | null {
  switch (provider) {
    case "evolution_api":
      return normalizeEvolutionPayload(raw);
    case "uazapi":
      return normalizeUazapiPayload(raw);
    case "rdstation_conversas":
      return normalizeRdConversasPayload(raw);
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** True when message can create a Lead without [rt:…] ticket. */
export function hasCtwaAttribution(msg: NormalizedWhatsappMessage): boolean {
  if (msg.ctwaClid) return true;
  return msg.referralSourceType === "ad" && Boolean(msg.referralSourceId);
}
