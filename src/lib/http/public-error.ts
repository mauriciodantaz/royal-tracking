import "server-only";

/** Stable public error codes — never leak internals to clients. */
export type PublicErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "origin_not_allowed"
  | "invalid_json"
  | "payload_too_large"
  | "internal";

export function publicErrorBody(
  code: PublicErrorCode,
  extra?: Record<string, unknown>
): { error: PublicErrorCode } & Record<string, unknown> {
  return { error: code, ...extra };
}

/** Log full error server-side; return a safe public code. */
export function logAndPublicError(
  scope: string,
  err: unknown,
  code: PublicErrorCode = "internal"
): PublicErrorCode {
  console.error(`[${scope}]`, err);
  return code;
}

/**
 * User-facing message for server actions (dashboard).
 * Intentional ActionResult strings stay as-is; unexpected errors stay generic.
 */
export function safeActionMessage(
  err: unknown,
  fallback = "Não foi possível concluir a operação. Tente de novo."
): string {
  if (err instanceof Error) {
    const msg = err.message.trim();
    // Known auth/session throws — map without leaking stacks.
    if (msg === "unauthorized") return "Sessão expirada. Entre novamente.";
    if (msg === "forbidden") return "Sem permissão para esta ação.";
    if (msg === "inactive") return "Conta desativada.";
  }
  console.error("[action]", err);
  return fallback;
}
