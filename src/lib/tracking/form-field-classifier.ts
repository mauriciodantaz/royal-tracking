/**
 * Multi-signal form field classifier (email/phone/name/…).
 * Shared by /api/lead (authoritative) and mirrored in public/snippet.js.
 */

import { normalizeFormFieldKey } from "./form-tracking-fields";

export type FieldKind =
  | "email"
  | "phone"
  | "name"
  | "cpf"
  | "cnpj"
  | "company"
  | "city"
  | "state"
  | "cep"
  | "address"
  | "number"
  | "neighborhood";

export type FieldSignals = {
  name?: string | null;
  id?: string | null;
  type?: string | null;
  autocomplete?: string | null;
  inputmode?: string | null;
  placeholder?: string | null;
  ariaLabel?: string | null;
  className?: string | null;
  dataAttrs?: string | null;
  label?: string | null;
  nearbyText?: string | null;
  value?: string | null;
};

export type FieldWinner = {
  kind: FieldKind;
  key: string;
  score: number;
  value: string;
};

export type FieldClassification = Partial<
  Record<FieldKind, { key: string; score: number }>
>;

const WEIGHTS = {
  type: 100,
  autocomplete: 80,
  inputmode: 70,
  name: 70,
  id: 60,
  placeholder: 50,
  label: 40,
  ariaLabel: 40,
  dataAttrs: 30,
  nearbyText: 25,
  className: 20,
  valueFormat: 35,
} as const;

const THRESHOLD = 60;

/** Tokens per kind (substring match on normalized haystack). */
const DICT: Record<FieldKind, string[]> = {
  email: [
    "email",
    "e-mail",
    "e_mail",
    "mail",
    "emailaddress",
    "email_address",
    "correo",
    "correo electronico",
    "correo electrónico",
  ],
  phone: [
    "telefone",
    "fone",
    "celular",
    "cel",
    "whatsapp",
    "whats",
    "zap",
    "phone",
    "telephone",
    "mobile",
    "mobile_phone",
    "phone_number",
    "telephone_number",
    "cell",
    "cellphone",
    "tel",
    "billing_phone",
    "shipping_phone",
  ],
  name: [
    "nome_completo",
    "nome completo",
    "primeiro_nome",
    "primeiro nome",
    "full_name",
    "fullname",
    "first_name",
    "firstname",
    "last_name",
    "lastname",
    "billing_name",
    "shipping_name",
    "person_name",
    "sobrenome",
    "nome",
    "name",
    "cliente",
    "contato",
    "responsavel",
    "responsável",
    "lead",
    "usuario",
    "usuário",
    "comprador",
    "titular",
    "customer",
    "contact",
    "owner",
    "buyer",
    "person",
    "recipient",
  ],
  cpf: ["cpf", "cpf_cliente", "tax_id"],
  cnpj: ["cnpj", "company_document", "company_tax_id"],
  company: [
    "empresa",
    "company",
    "organization",
    "organisation",
    "business",
    "corporation",
    "razao",
    "razão",
  ],
  city: ["cidade", "city", "municipio", "município", "municipality"],
  state: ["estado", "uf", "state", "province", "provincia", "província"],
  cep: ["cep", "zipcode", "postalcode", "postal_code", "zip", "zip_code"],
  address: [
    "address",
    "endereco",
    "endereço",
    "logradouro",
    "street",
    "road",
    "avenue",
    "rua",
  ],
  number: ["numero", "número", "number", "house_number", "num"],
  neighborhood: ["bairro", "district", "neighborhood", "neighbourhood"],
};

/** Kinds that should not win on weak "contact"/"lead" alone without stronger signals. */
const WEAK_NAME_ONLY = new Set([
  "cliente",
  "contato",
  "contact",
  "lead",
  "owner",
  "person",
  "recipient",
  "buyer",
  "customer",
  "usuario",
  "usuário",
  "comprador",
  "titular",
  "responsavel",
  "responsável",
]);

function norm(s: string | null | undefined): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function haystackTokenScore(hay: string, tokens: string[], weight: number): number {
  if (!hay) return 0;
  let best = 0;
  for (const t of tokens) {
    const token = norm(t);
    if (!token) continue;
    if (hay === token || hay.includes(token)) {
      // Longer token match is more specific
      const boost = Math.min(20, token.length);
      best = Math.max(best, weight + boost);
    }
  }
  return best;
}

function scoreKind(kind: FieldKind, signals: FieldSignals): number {
  const tokens = DICT[kind];
  let score = 0;

  const type = norm(signals.type);
  const autocomplete = norm(signals.autocomplete);
  const inputmode = norm(signals.inputmode);

  if (kind === "email") {
    if (type === "email") score += WEIGHTS.type;
    if (
      autocomplete === "email" ||
      autocomplete.includes("email")
    ) {
      score += WEIGHTS.autocomplete;
    }
  }
  if (kind === "phone") {
    if (type === "tel") score += WEIGHTS.type;
    if (
      autocomplete === "tel" ||
      autocomplete.startsWith("tel") ||
      autocomplete.includes("phone")
    ) {
      score += WEIGHTS.autocomplete;
    }
    if (inputmode === "tel" || inputmode === "numeric") {
      score += WEIGHTS.inputmode;
    }
  }
  if (kind === "name") {
    if (
      autocomplete === "name" ||
      autocomplete === "given-name" ||
      autocomplete === "family-name" ||
      autocomplete === "nickname"
    ) {
      score += WEIGHTS.autocomplete;
    }
  }
  if (kind === "cep") {
    if (autocomplete === "postal-code") score += WEIGHTS.autocomplete;
  }
  if (kind === "address") {
    if (
      autocomplete === "street-address" ||
      autocomplete === "address-line1"
    ) {
      score += WEIGHTS.autocomplete;
    }
  }
  if (kind === "city" && autocomplete === "address-level2") {
    score += WEIGHTS.autocomplete;
  }
  if (kind === "state" && autocomplete === "address-level1") {
    score += WEIGHTS.autocomplete;
  }
  if (kind === "company" && autocomplete === "organization") {
    score += WEIGHTS.autocomplete;
  }

  const nameKey = normalizeFormFieldKey(signals.name || "");
  const idKey = normalizeFormFieldKey(signals.id || "");

  score += haystackTokenScore(nameKey, tokens, WEIGHTS.name);
  score += haystackTokenScore(idKey, tokens, WEIGHTS.id);
  score += haystackTokenScore(norm(signals.placeholder), tokens, WEIGHTS.placeholder);
  score += haystackTokenScore(norm(signals.label), tokens, WEIGHTS.label);
  score += haystackTokenScore(norm(signals.ariaLabel), tokens, WEIGHTS.ariaLabel);
  score += haystackTokenScore(norm(signals.dataAttrs), tokens, WEIGHTS.dataAttrs);
  score += haystackTokenScore(norm(signals.nearbyText), tokens, WEIGHTS.nearbyText);
  score += haystackTokenScore(norm(signals.className), tokens, WEIGHTS.className);

  const val = String(signals.value || "").trim();
  if (val) {
    if (kind === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      score += WEIGHTS.valueFormat;
    }
    if (kind === "phone") {
      const digits = val.replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 13) {
        score += WEIGHTS.valueFormat;
      }
    }
    if (kind === "cpf") {
      const digits = val.replace(/\D/g, "");
      if (digits.length === 11) score += WEIGHTS.valueFormat;
    }
    if (kind === "cnpj") {
      const digits = val.replace(/\D/g, "");
      if (digits.length === 14) score += WEIGHTS.valueFormat;
    }
    if (kind === "cep") {
      const digits = val.replace(/\D/g, "");
      if (digits.length === 8) score += WEIGHTS.valueFormat;
    }
  }

  // Penalize weak name tokens when nothing else supports name
  if (kind === "name" && score < WEIGHTS.name + 15) {
    const weak =
      WEAK_NAME_ONLY.has(nameKey) || WEAK_NAME_ONLY.has(idKey);
    if (weak && type !== "text" && !autocomplete.includes("name")) {
      score = Math.max(0, score - 40);
    }
  }

  // Avoid phone winning on bare "contato" via name dict overlap — phone dict has no contato
  // Avoid email false positive on "mail" inside unrelated words handled by includes — ok

  return score;
}

const ALL_KINDS: FieldKind[] = [
  "email",
  "phone",
  "name",
  "cpf",
  "cnpj",
  "company",
  "city",
  "state",
  "cep",
  "address",
  "number",
  "neighborhood",
];

export function classifyField(
  signals: FieldSignals
): { kind: FieldKind; score: number } | null {
  let best: { kind: FieldKind; score: number } | null = null;
  for (const kind of ALL_KINDS) {
    const score = scoreKind(kind, signals);
    if (score < THRESHOLD) continue;
    if (!best || score > best.score) {
      best = { kind, score };
    }
  }
  return best;
}

/**
 * Classify a bag of field key→value (server path without DOM).
 * One field key maps to at most one kind; each kind keeps the highest-scoring field.
 */
export function classifyFieldBag(
  fields: Record<string, string>
): { winners: FieldWinner[]; classification: FieldClassification } {
  const winnersByKind = new Map<FieldKind, FieldWinner>();

  for (const [rawKey, rawVal] of Object.entries(fields)) {
    const value = String(rawVal ?? "").trim();
    if (!value) continue;
    const key = rawKey;
    const result = classifyField({
      name: rawKey,
      id: rawKey,
      value,
    });
    if (!result) continue;
    const prev = winnersByKind.get(result.kind);
    if (!prev || result.score > prev.score) {
      winnersByKind.set(result.kind, {
        kind: result.kind,
        key,
        score: result.score,
        value,
      });
    }
  }

  const winners = [...winnersByKind.values()];
  const classification: FieldClassification = {};
  for (const w of winners) {
    classification[w.kind] = { key: w.key, score: w.score };
  }
  return { winners, classification };
}

export function pickEmailPhoneNameFromClassification(
  fields: Record<string, string>,
  clientHints?: FieldClassification | null
): {
  email?: string;
  phone?: string;
  name?: string;
  classification: FieldClassification;
} {
  const fromBag = classifyFieldBag(fields);
  const classification: FieldClassification = { ...fromBag.classification };

  // Merge client hints only when server also finds the same kind with same/better key,
  // or when server has no winner — re-score the hinted key.
  if (clientHints) {
    for (const kind of Object.keys(clientHints) as FieldKind[]) {
      const hint = clientHints[kind];
      if (!hint?.key) continue;
      const val = fields[hint.key];
      if (val == null || !String(val).trim()) continue;
      const rescored = classifyField({
        name: hint.key,
        id: hint.key,
        value: String(val),
      });
      if (!rescored || rescored.kind !== kind) continue;
      const existing = classification[kind];
      if (!existing || rescored.score >= existing.score) {
        classification[kind] = { key: hint.key, score: rescored.score };
      }
    }
  }

  const emailKey = classification.email?.key;
  const phoneKey = classification.phone?.key;
  const nameKey = classification.name?.key;

  return {
    email: emailKey ? String(fields[emailKey]).trim() : undefined,
    phone: phoneKey ? String(fields[phoneKey]).trim() : undefined,
    name: nameKey ? String(fields[nameKey]).trim() : undefined,
    classification,
  };
}
