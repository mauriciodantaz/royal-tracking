const EMAIL_RE = /([A-Z0-9._%+-]{1,64})@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/g;
const BEARER_RE = /(bearer\s+)[A-Za-z0-9._\-+=/]+/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function maskEmail(match: string): string {
  const [local, domain] = match.split("@");
  if (!local || !domain) return "***@***";
  const keep = local.slice(0, Math.min(3, local.length));
  return `${keep}***@${domain}`;
}

function maskPhone(match: string): string {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 8) return "***";
  const head = digits.slice(0, 4);
  const tail = digits.slice(-2);
  return `${head}******${tail}`;
}

/** Redact common secrets/PII before writing to logs. */
export function redactForLog(value: unknown): string {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }

  return text
    .replace(BEARER_RE, "$1***")
    .replace(JWT_RE, "[redacted-jwt]")
    .replace(EMAIL_RE, (m) => maskEmail(m))
    .replace(PHONE_RE, (m) => maskPhone(m));
}

export function safeConsoleError(scope: string, err: unknown): void {
  if (err instanceof Error) {
    console.error(`[${scope}]`, redactForLog(err.message), err.stack);
    return;
  }
  console.error(`[${scope}]`, redactForLog(err));
}
