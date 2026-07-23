import "server-only";

import { listAccessibleCustomers } from "@/lib/google-ads/upload";
import { META_GRAPH_BASE_URL } from "@/lib/meta/constants";
import { newEventId } from "@/lib/tracking/hash";

export type CredentialValidation =
  | { ok: true }
  | { ok: false; error: string };

function metaErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { message?: string; type?: string; code?: number } })
      .error;
    if (err?.message) {
      const code = err.code != null ? ` (código ${err.code})` : "";
      return `${err.message}${code}`;
    }
  }
  return `Meta recusou a conexão (HTTP ${status}). Verifique Pixel ID / Ad Account e o token.`;
}

function summarizeJsonError(body: unknown, fallback: string): string {
  if (!body) return fallback;
  if (typeof body === "string") return body.slice(0, 400);
  if (typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
    if (o.error && typeof o.error === "object") {
      const e = o.error as Record<string, unknown>;
      if (typeof e.message === "string") return e.message;
    }
    try {
      return JSON.stringify(body).slice(0, 400);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function validateMetaPixel(
  pixelId: string,
  token: string
): Promise<CredentialValidation> {
  if (!pixelId) {
    return { ok: false, error: "Informe o Pixel ID." };
  }
  if (!token) {
    return { ok: false, error: "Informe o Token CAPI." };
  }

  const payload = {
    data: [
      {
        event_name: "PageView",
        event_time: Math.floor(Date.now() / 1000),
        event_id: newEventId(),
        action_source: "website",
        event_source_url: "https://royalgrowth.com.br/",
        user_data: {
          client_ip_address: "8.8.8.8",
          client_user_agent:
            "Mozilla/5.0 (compatible; RoyalTracking/1.0; +https://tracking.royalgrowth.com.br)",
        },
      },
    ],
  };

  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao contatar a Meta: ${e instanceof Error ? e.message : "erro de rede"}`,
    };
  }

  if (!res.ok) {
    return { ok: false, error: metaErrorMessage(body, res.status) };
  }

  // Meta may return 200 with error-like messages in events_received = 0
  const eventsReceived =
    body && typeof body === "object" && "events_received" in body
      ? Number((body as { events_received?: number }).events_received)
      : null;
  if (eventsReceived === 0) {
    return {
      ok: false,
      error:
        "A Meta aceitou a requisição, mas não recebeu o evento de teste. Verifique o Pixel ID e as permissões do token.",
    };
  }

  return { ok: true };
}

async function validateMetaAds(
  adAccountId: string,
  token: string
): Promise<CredentialValidation> {
  const adId = adAccountId.replace(/^act_/, "").trim();
  if (!adId) {
    return { ok: false, error: "Informe o Ad Account ID." };
  }
  if (!token) {
    return { ok: false, error: "Informe o Ads token." };
  }

  const url = `${META_GRAPH_BASE_URL}/act_${encodeURIComponent(adId)}?fields=name,account_id,account_status&access_token=${encodeURIComponent(token)}`;
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(url);
    body = await res.json().catch(() => null);
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao contatar a Meta: ${e instanceof Error ? e.message : "erro de rede"}`,
    };
  }

  if (!res.ok) {
    return { ok: false, error: metaErrorMessage(body, res.status) };
  }

  return { ok: true };
}

async function validateGa4(
  measurementId: string,
  apiSecret: string
): Promise<CredentialValidation> {
  if (!measurementId || !/^G-[A-Z0-9]+$/i.test(measurementId)) {
    return {
      ok: false,
      error: "Measurement ID inválido. Use o formato G-XXXXXXXX.",
    };
  }
  if (!apiSecret) {
    return { ok: false, error: "Informe o API Secret do Measurement Protocol." };
  }

  const payload = {
    client_id: "royal_tracking.credential_check",
    events: [
      {
        name: "page_view",
        params: {
          engagement_time_msec: 1,
          event_id: newEventId(),
        },
      },
    ],
  };

  const url = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao contatar o Google Analytics: ${e instanceof Error ? e.message : "erro de rede"}`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: summarizeJsonError(
        body,
        `Google Analytics recusou a conexão (HTTP ${res.status}). Verifique Measurement ID e API Secret.`
      ),
    };
  }

  const messages =
    body &&
    typeof body === "object" &&
    Array.isArray((body as { validationMessages?: unknown }).validationMessages)
      ? (
          body as {
            validationMessages: Array<{
              description?: string;
              validationCode?: string;
            }>;
          }
        ).validationMessages
      : [];

  const hard = messages.filter((m) => {
    const code = (m.validationCode ?? "").toUpperCase();
    // VALUE_* are often soft; reject auth/config style codes
    return (
      code.includes("INVALID") ||
      code.includes("DENIED") ||
      code.includes("UNAUTHORIZED") ||
      code.includes("SECRET") ||
      code.includes("MEASUREMENT")
    );
  });

  if (hard.length > 0) {
    return {
      ok: false,
      error: hard
        .map((m) => m.description || m.validationCode || "erro de validação")
        .join(" · "),
    };
  }

  return { ok: true };
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

async function validateEvolutionInstance(
  baseUrl: string,
  instanceName: string,
  token: string
): Promise<CredentialValidation> {
  if (!baseUrl) {
    return { ok: false, error: "Informe a URL da Evolution." };
  }
  if (!instanceName) {
    return { ok: false, error: "Informe o nome da instância." };
  }
  if (!token) {
    return { ok: false, error: "Informe a API key da instância." };
  }

  const url = `${normalizeBaseUrl(baseUrl)}/instance/connectionState/${encodeURIComponent(instanceName)}`;
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(url, {
      headers: { apikey: token, Accept: "application/json" },
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao contatar a Evolution: ${e instanceof Error ? e.message : "erro de rede"}`,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      error: "Sem permissão: API key da instância inválida ou sem acesso.",
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: "Instância não encontrada. Confira o nome e a URL da Evolution.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: summarizeJsonError(
        body,
        `Evolution recusou a conexão (HTTP ${res.status}).`
      ),
    };
  }
  return { ok: true };
}

async function validateUazapiInstance(
  baseUrl: string,
  token: string
): Promise<CredentialValidation> {
  if (!baseUrl) {
    return { ok: false, error: "Informe a Base URL da UazAPI." };
  }
  if (!token) {
    return { ok: false, error: "Informe o token da instância." };
  }

  const base = normalizeBaseUrl(baseUrl);
  const candidates = [`${base}/instance/status`, `${base}/status`];
  let lastError = "UazAPI recusou o token.";

  for (const url of candidates) {
    let res: Response;
    let body: unknown;
    try {
      res = await fetch(url, {
        headers: { token, Accept: "application/json" },
      });
      body = await res.json().catch(() => null);
    } catch (e) {
      lastError = `Falha ao contatar a UazAPI: ${e instanceof Error ? e.message : "erro de rede"}`;
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "Sem permissão: token da instância inválido.",
      };
    }
    if (res.ok) return { ok: true };
    if (res.status !== 404) {
      lastError = summarizeJsonError(
        body,
        `UazAPI recusou a conexão (HTTP ${res.status}).`
      );
    }
  }

  return { ok: false, error: lastError };
}

/**
 * Valida credenciais contra a plataforma antes de persistir (estilo n8n).
 * Webhooks inbound só checam formato local — o secret é definido por nós.
 */
export async function validateIntegrationCredentials(input: {
  provider: string;
  accessToken?: string | null;
  webhookSecret?: string | null;
  config: Record<string, string>;
}): Promise<CredentialValidation> {
  const token = input.accessToken?.trim() || "";
  const cfg = input.config;

  switch (input.provider) {
    case "meta_pixel":
      return validateMetaPixel(
        cfg.pixel_id || "",
        token
      );
    case "meta_ads":
      return validateMetaAds(cfg.ad_account_id || "", token);
    case "ga4":
      return validateGa4(cfg.measurement_id || "", token);
    case "pipedrive": {
      const clientId = cfg.client_id?.trim() || "";
      if (!clientId) {
        return {
          ok: false,
          error: "Informe o Client ID do app Pipedrive (Developer Hub).",
        };
      }
      return { ok: true };
    }
    case "rdstation_conversas":
      // Só escuta webhook Tallos — secret gerado por nós; sem API remota.
      return { ok: true };
    case "hotmart":
    case "kiwify":
    case "eduzz": {
      const secret = input.webhookSecret?.trim() || "";
      if (secret.length < 8) {
        return {
          ok: false,
          error:
            "Webhook token muito curto. Use pelo menos 8 caracteres (o mesmo valor configurado no marketplace).",
        };
      }
      return { ok: true };
    }
    case "snippet":
      return { ok: true };
    case "google_ads": {
      const customerId = (cfg.customer_id || "").replace(/\D/g, "");
      const conversionActionId = (cfg.conversion_action_id || "").replace(
        /\D/g,
        ""
      );
      // OAuth create often só tem label; customer/action vêm no update pós-OAuth.
      if (!customerId && !conversionActionId) return { ok: true };
      if (!customerId || customerId.length < 6) {
        return {
          ok: false,
          error: "Informe o Customer ID da conta Google Ads (números).",
        };
      }
      if (!conversionActionId) {
        return {
          ok: false,
          error: "Informe o Conversion Action ID (numérico).",
        };
      }
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
      if (!developerToken) {
        return {
          ok: false,
          error:
            "Defina GOOGLE_ADS_DEVELOPER_TOKEN na stack (Portainer) para enviar conversões.",
        };
      }
      if (token) {
        const listed = await listAccessibleCustomers(token, developerToken);
        if (!listed.ok) {
          return {
            ok: false,
            error: `Google Ads OAuth ok, mas API falhou: ${listed.error ?? "erro"}`,
          };
        }
        if (
          listed.customerIds.length > 0 &&
          !listed.customerIds.includes(customerId)
        ) {
          return {
            ok: false,
            error: `Customer ID ${customerId} não está nas contas acessíveis deste OAuth.`,
          };
        }
      }
      return { ok: true };
    }
    case "rdstation_crm":
    case "rdstation_mkt": {
      const clientId = cfg.client_id?.trim() || "";
      if (!clientId) {
        return { ok: false, error: "Informe o Client ID do app RD App Store." };
      }
      return { ok: true };
    }
    case "evolution_api":
      return validateEvolutionInstance(
        cfg.base_url || "",
        cfg.instance_name || "",
        token
      );
    case "uazapi":
      return validateUazapiInstance(cfg.base_url || "", token);
    default:
      return { ok: true };
  }
}
