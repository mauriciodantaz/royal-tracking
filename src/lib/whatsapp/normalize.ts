/** Normalize Evolution / UazAPI Go inbound payloads into a common shape. */

export type NormalizedWhatsappMessage = {
  phone: string | null;
  pushName: string | null;
  text: string;
  messageId: string;
  fromMe: boolean;
  isGroup: boolean;
  timestamp: number;
  provider: "evolution_api" | "uazapi";
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

  return {
    phone: digitsPhone(remoteJid),
    pushName,
    text: text.trim(),
    messageId,
    fromMe,
    isGroup: jidIsGroup(remoteJid),
    timestamp,
    provider: "evolution_api",
  };
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

  return {
    phone: digitsPhone(chatId),
    pushName,
    text: text.trim(),
    messageId,
    fromMe,
    isGroup,
    timestamp,
    provider: "uazapi",
  };
}

export function normalizeWhatsappPayload(
  provider: "evolution_api" | "uazapi",
  raw: unknown
): NormalizedWhatsappMessage | null {
  switch (provider) {
    case "evolution_api":
      return normalizeEvolutionPayload(raw);
    case "uazapi":
      return normalizeUazapiPayload(raw);
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}
