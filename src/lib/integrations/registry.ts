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
  | "evolution_api"
  | "uazapi"
  | "snippet";

export type IntegrationAuthType =
  | "oauth"
  | "token"
  | "basic"
  | "webhook_secret"
  | "none";

export type IntegrationDirection = "inbound" | "outbound" | "both";

export type IntegrationSegment =
  | "site_media"
  | "marketplace"
  | "crm_marketing"
  | "whatsapp";

export const INTEGRATION_SEGMENTS = [
  { id: "site_media", label: "Site e mídia" },
  { id: "marketplace", label: "Marketplaces" },
  { id: "crm_marketing", label: "Marketing e vendas" },
  { id: "whatsapp", label: "WhatsApp" },
] as const satisfies ReadonlyArray<{ id: IntegrationSegment; label: string }>;

export type IntegrationModuleDef = {
  provider: IntegrationProvider;
  name: string;
  description: string;
  authType: IntegrationAuthType;
  direction: IntegrationDirection;
  segment: IntegrationSegment;
  connectFields: Array<{
    key: string;
    label: string;
    secret?: boolean;
    required?: boolean;
    placeholder?: string;
  }>;
  defaultSourceEvents?: string[];
  /** Markdown slug under docs/integrations/ (non-OAuth only) */
  docsSlug?: string;
  /**
   * When true, the module stays in the registry/backend but is hidden from
   * the integrations UI (gallery, detail, docs). Temporary publish test flag.
   */
  uiHidden?: boolean;
};

export const INTEGRATION_MODULES: IntegrationModuleDef[] = [
  {
    provider: "meta_pixel",
    name: "Meta (CAPI / Pixel)",
    description:
      "Modo web + server (deduplicação por event_id): Pixel no browser e CAPI no servidor em paralelo.",
    authType: "token",
    direction: "outbound",
    segment: "site_media",
    docsSlug: "meta-pixel",
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
    segment: "site_media",
    docsSlug: "meta-ads",
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
    segment: "site_media",
    docsSlug: "ga4",
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
    segment: "site_media",
    connectFields: [{ key: "label", label: "Nome", required: true }],
  },
  {
    provider: "hotmart",
    name: "Hotmart",
    description: "Webhook de compras — N contas.",
    authType: "webhook_secret",
    direction: "inbound",
    segment: "marketplace",
    docsSlug: "hotmart",
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
    segment: "marketplace",
    docsSlug: "kiwify",
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
    segment: "marketplace",
    docsSlug: "eduzz",
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
    description:
      "OAuth — funis/estágios via webhooks deal_created/updated → Meta CAPI e GA4 (server).",
    authType: "oauth",
    direction: "both",
    segment: "crm_marketing",
    docsSlug: "rdstation-crm",
    connectFields: [
      { key: "label", label: "Nome", required: true },
      {
        key: "client_id",
        label: "Client ID",
        required: true,
        placeholder: "App RD App Store",
      },
      {
        key: "client_secret",
        label: "Client Secret",
        secret: true,
        required: true,
      },
    ],
    defaultSourceEvents: ["Lead", "InitiateCheckout", "Purchase"],
  },
  {
    provider: "rdstation_mkt",
    name: "RD Station Marketing",
    description:
      "OAuth — conversões (WEBHOOK.CONVERTED) e lifecycle → Meta CAPI e GA4 (server).",
    authType: "oauth",
    direction: "both",
    segment: "crm_marketing",
    docsSlug: "rdstation-mkt",
    connectFields: [
      { key: "label", label: "Nome", required: true },
      {
        key: "client_id",
        label: "Client ID",
        required: true,
        placeholder: "App RD App Store",
      },
      {
        key: "client_secret",
        label: "Client Secret",
        secret: true,
        required: true,
      },
    ],
    defaultSourceEvents: ["Lead", "InitiateCheckout", "Purchase"],
  },
  {
    provider: "rdstation_conversas",
    name: "RD Conversas",
    description:
      "WhatsApp via RD Conversas — cole a URL do webhook no Tallos → Lead com ticket (igual UazAPI).",
    authType: "none",
    direction: "inbound",
    segment: "whatsapp",
    docsSlug: "rdstation-conversas",
    connectFields: [{ key: "label", label: "Nome", required: true }],
    defaultSourceEvents: ["Lead"],
  },
  {
    provider: "pipedrive",
    name: "Pipedrive",
    description: "Token ou OAuth — deals e pessoas.",
    authType: "token",
    direction: "inbound",
    segment: "crm_marketing",
    docsSlug: "pipedrive",
    // Temporarily hidden for publish-sequence test; restore by removing uiHidden.
    uiHidden: true,
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
    provider: "evolution_api",
    name: "Evolution API",
    description:
      "WhatsApp self-hosted (Evolution latest) — ticket na 1ª mensagem → Lead Meta/GA4. Uma connection por instância.",
    authType: "token",
    direction: "inbound",
    segment: "whatsapp",
    docsSlug: "evolution-api",
    connectFields: [
      { key: "label", label: "Nome", required: true },
      {
        key: "base_url",
        label: "URL da Evolution",
        required: true,
        placeholder: "https://evolution.seudominio.com",
      },
      {
        key: "instance_name",
        label: "Nome da instância",
        required: true,
        placeholder: "minha-instancia",
      },
      {
        key: "access_token",
        label: "API key da instância",
        secret: true,
        required: true,
      },
    ],
    defaultSourceEvents: ["Lead"],
  },
  {
    provider: "uazapi",
    name: "UazAPI Go",
    description:
      "WhatsApp cloud (UazAPI Go) — ticket na 1ª mensagem → Lead Meta/GA4. Uma connection por instância.",
    authType: "token",
    direction: "inbound",
    segment: "whatsapp",
    docsSlug: "uazapi",
    connectFields: [
      { key: "label", label: "Nome", required: true },
      {
        key: "base_url",
        label: "Base URL",
        required: true,
        placeholder: "https://subdominio.uazapi.com",
      },
      {
        key: "access_token",
        label: "Token da instância",
        secret: true,
        required: true,
      },
    ],
    defaultSourceEvents: ["Lead"],
  },
  {
    provider: "snippet",
    name: "Site / Forms",
    description: "Snippet no site — PageView, Lead e eventos manuais.",
    authType: "none",
    direction: "inbound",
    segment: "site_media",
    docsSlug: "snippet",
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

/** Modules shown in the integrations dashboard (excludes uiHidden). */
export function listUiModules(): IntegrationModuleDef[] {
  return INTEGRATION_MODULES.filter((m) => !m.uiHidden);
}

export type UiModuleSegmentGroup = {
  id: IntegrationSegment;
  label: string;
  modules: IntegrationModuleDef[];
};

/** Visible modules grouped by segment; omits empty segments. */
export function groupUiModulesBySegment(): UiModuleSegmentGroup[] {
  const visible = listUiModules();
  const groups: UiModuleSegmentGroup[] = [];
  for (const seg of INTEGRATION_SEGMENTS) {
    const modules = visible.filter((m) => m.segment === seg.id);
    if (modules.length === 0) continue;
    groups.push({ id: seg.id, label: seg.label, modules });
  }
  return groups;
}

export function isUiVisibleProvider(v: string): v is IntegrationProvider {
  const mod = getModule(v);
  return Boolean(mod && !mod.uiHidden);
}

/** Docs slug for modules that have credential/setup guides. */
export function getIntegrationDocsSlug(
  provider: string
): string | undefined {
  const mod = getModule(provider);
  return mod?.docsSlug;
}
