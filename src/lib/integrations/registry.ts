export type IntegrationProvider =
  | "meta_pixel"
  | "meta_ads"
  | "ga4"
  | "google_ads"
  | "hotmart"
  | "kiwify"
  | "eduzz"
  | "rdstation_crm"
  | "rdstation_mkt"
  | "rdstation_conversas"
  | "pipedrive"
  | "snippet";

export type IntegrationAuthType =
  | "oauth"
  | "token"
  | "basic"
  | "webhook_secret"
  | "none";

export type IntegrationDirection = "inbound" | "outbound" | "both";

export type IntegrationModuleDef = {
  provider: IntegrationProvider;
  name: string;
  description: string;
  authType: IntegrationAuthType;
  direction: IntegrationDirection;
  /** Phase when the module becomes fully usable */
  phase: 1 | 2 | 3;
  connectFields: Array<{
    key: string;
    label: string;
    secret?: boolean;
    required?: boolean;
    placeholder?: string;
  }>;
  defaultSourceEvents?: string[];
};

export const INTEGRATION_MODULES: IntegrationModuleDef[] = [
  {
    provider: "meta_pixel",
    name: "Meta (CAPI / Pixel)",
    description:
      "Modo web + server (deduplicação por event_id): Pixel no browser e CAPI no servidor em paralelo.",
    authType: "token",
    direction: "outbound",
    phase: 1,
    connectFields: [
      { key: "label", label: "Nome", required: true },
      { key: "pixel_id", label: "Pixel ID", required: true },
      {
        key: "access_token",
        label: "Token CAPI",
        secret: true,
        required: true,
      },
      {
        key: "test_event_code",
        label: "Test event code (opcional)",
        required: false,
        placeholder: "TEST12345",
      },
    ],
  },
  {
    provider: "meta_ads",
    name: "Meta Ads",
    description: "Conta de anúncios para insights e campanhas.",
    authType: "token",
    direction: "outbound",
    phase: 1,
    connectFields: [
      { key: "label", label: "Nome", required: true },
      { key: "ad_account_id", label: "Ad Account ID", required: true },
      { key: "access_token", label: "Ads token", secret: true, required: true },
    ],
  },
  {
    provider: "ga4",
    name: "Google Analytics 4",
    description:
      "Modo web + server (deduplicação por event_id): gtag no browser e Measurement Protocol no servidor em paralelo.",
    authType: "token",
    direction: "outbound",
    phase: 1,
    connectFields: [
      { key: "label", label: "Nome", required: true },
      { key: "measurement_id", label: "Measurement ID", required: true },
      { key: "access_token", label: "API Secret", secret: true, required: true },
    ],
  },
  {
    provider: "google_ads",
    name: "Google Ads",
    description: "Upload de conversões (OAuth).",
    authType: "oauth",
    direction: "outbound",
    phase: 3,
    connectFields: [{ key: "label", label: "Nome", required: true }],
  },
  {
    provider: "hotmart",
    name: "Hotmart",
    description: "Webhook de compras — N contas.",
    authType: "webhook_secret",
    direction: "inbound",
    phase: 2,
    connectFields: [
      { key: "label", label: "Nome", required: true },
      {
        key: "webhook_secret",
        label: "Webhook token / hottok",
        secret: true,
        required: true,
      },
    ],
    defaultSourceEvents: ["Purchase"],
  },
  {
    provider: "kiwify",
    name: "Kiwify",
    description: "Webhook de compras — N contas.",
    authType: "webhook_secret",
    direction: "inbound",
    phase: 2,
    connectFields: [
      { key: "label", label: "Nome", required: true },
      {
        key: "webhook_secret",
        label: "Webhook token",
        secret: true,
        required: true,
      },
    ],
    defaultSourceEvents: ["Purchase"],
  },
  {
    provider: "eduzz",
    name: "Eduzz",
    description: "Webhook de compras.",
    authType: "webhook_secret",
    direction: "inbound",
    phase: 2,
    connectFields: [
      { key: "label", label: "Nome", required: true },
      {
        key: "webhook_secret",
        label: "Webhook token",
        secret: true,
        required: true,
      },
    ],
    defaultSourceEvents: ["Purchase"],
  },
  {
    provider: "rdstation_crm",
    name: "RD Station CRM",
    description: "OAuth — estágios e oportunidades.",
    authType: "oauth",
    direction: "both",
    phase: 2,
    connectFields: [{ key: "label", label: "Nome", required: true }],
    defaultSourceEvents: ["Lead", "deal.won", "Contact"],
  },
  {
    provider: "rdstation_mkt",
    name: "RD Station Marketing",
    description: "OAuth — conversões e leads.",
    authType: "oauth",
    direction: "both",
    phase: 2,
    connectFields: [{ key: "label", label: "Nome", required: true }],
    defaultSourceEvents: ["Lead", "Conversion"],
  },
  {
    provider: "rdstation_conversas",
    name: "RD Conversas",
    description: "Token / OAuth — conversas.",
    authType: "token",
    direction: "inbound",
    phase: 2,
    connectFields: [
      { key: "label", label: "Nome", required: true },
      { key: "access_token", label: "API token", secret: true, required: true },
    ],
    defaultSourceEvents: ["Lead", "Message"],
  },
  {
    provider: "pipedrive",
    name: "Pipedrive",
    description: "Token ou OAuth — deals e pessoas.",
    authType: "token",
    direction: "inbound",
    phase: 2,
    connectFields: [
      { key: "label", label: "Nome", required: true },
      { key: "access_token", label: "API token", secret: true, required: true },
      {
        key: "account_external_id",
        label: "Company domain (opcional)",
        required: false,
      },
    ],
    defaultSourceEvents: ["Lead", "deal.won"],
  },
  {
    provider: "snippet",
    name: "Site / Forms",
    description: "Snippet no site — PageView, Lead e eventos manuais.",
    authType: "none",
    direction: "inbound",
    phase: 1,
    connectFields: [],
    defaultSourceEvents: ["PageView", "Lead", "InitiateCheckout", "Purchase"],
  },
];

export function getModule(provider: string): IntegrationModuleDef | undefined {
  return INTEGRATION_MODULES.find((m) => m.provider === provider);
}

export function isIntegrationProvider(v: string): v is IntegrationProvider {
  return INTEGRATION_MODULES.some((m) => m.provider === v);
}
