/**
 * Valida env crítico em produção (stacks Hub / Portainer).
 * Dev local (`next dev`) não entra — NODE_ENV !== "production".
 */

export function isEnvPlaceholder(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (/[<>]/.test(v)) return true;
  if (/^CHANGE_ME\b/i.test(v)) return true;
  if (/CHANGE_ME_[A-Z0-9_]+/i.test(v)) return true;
  return false;
}

export function collectRuntimeEnvErrors(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (env.NODE_ENV !== "production") return [];

  const errors: string[] = [];

  const appUrl = (
    env.NEXT_PUBLIC_APP_URL ??
    env.NEXTAUTH_URL ??
    env.AUTH_URL ??
    ""
  ).trim();
  if (isEnvPlaceholder(appUrl)) {
    errors.push(
      "NEXT_PUBLIC_APP_URL ou NEXTAUTH_URL obrigatório (sem placeholders tipo <DOMAIN> / CHANGE_ME)"
    );
  }

  const apex = (env.ALLOWED_EVENT_DOMAINS ?? "").trim();
  if (isEnvPlaceholder(apex)) {
    errors.push(
      "ALLOWED_EVENT_DOMAINS obrigatório em produção (apex do site, ex.: cliente.com.br — não o host do painel)"
    );
  }

  for (const key of [
    "ENCRYPTION_KEY",
    "AUTH_SECRET",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
  ] as const) {
    const raw = env[key] ?? "";
    if (isEnvPlaceholder(raw)) {
      errors.push(`${key} obrigatório em produção (sem placeholders)`);
    }
  }

  return errors;
}

export function assertRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env
): void {
  const errors = collectRuntimeEnvErrors(env);
  if (errors.length === 0) return;
  throw new Error(
    `Royal Tracking: env inválido em produção:\n- ${errors.join("\n- ")}`
  );
}
