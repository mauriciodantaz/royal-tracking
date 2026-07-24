"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import {
  createAuthToken,
  RESET_TTL_MS,
} from "@/lib/auth/tokens";
import { isStackSuperAdmin } from "@/lib/auth/super-admin";
import { ensureDbReady } from "@/lib/db/boot";
import { queryOne } from "@/lib/db/pool";
import type { UserRow } from "@/lib/db/types";
import { safeConsoleError } from "@/lib/http/log-redact";
import { resetEmail } from "@/lib/mail/templates";
import { isSmtpConfigured, sendMail } from "@/lib/mail/smtp";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIpFromHeaders } from "@/lib/tracking/request";

export type ForgotResult = { ok: true; message: string };

function emailKey(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);
}

/**
 * Always returns a neutral success message to avoid user enumeration,
 * except when SMTP is missing (ops need a clear signal).
 */
export async function forgotPasswordAction(
  _prev: ForgotResult | undefined,
  formData: FormData
): Promise<ForgotResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const neutral: ForgotResult = {
    ok: true,
    message:
      "Se o e-mail existir e puder recuperar senha, enviaremos as instruções.",
  };

  const h = await headers();
  const ip = getClientIpFromHeaders(h);
  const ipLimit = rateLimit(`reset:ip:${ip}`, 10, 60_000);
  const emailLimit = email
    ? rateLimit(`reset:email:${emailKey(email)}`, 5, 60_000)
    : { ok: true };
  if (!ipLimit.ok || !emailLimit.ok) {
    return {
      ok: true,
      message:
        "Se o e-mail existir e puder recuperar senha, enviaremos as instruções.",
    };
  }

  if (!email) return neutral;

  // Super admin cannot reset via email — still return the same neutral message
  // to avoid confirming that ADMIN_EMAIL is privileged.
  if (isStackSuperAdmin(email)) {
    return neutral;
  }

  if (!isSmtpConfigured()) {
    return {
      ok: true,
      message:
        "O envio de e-mail ainda não está configurado. Peça ao administrador da instalação para ativá-lo.",
    };
  }

  try {
    await ensureDbReady();
    const user = await queryOne<UserRow>(
      `select * from users where email = $1 limit 1`,
      [email]
    );
    if (
      user &&
      user.active &&
      user.role !== "super_admin" &&
      user.password_hash
    ) {
      const token = await createAuthToken({
        userId: user.id,
        purpose: "reset",
        ttlMs: RESET_TTL_MS,
      });
      const tpl = resetEmail({ name: user.name, token });
      await sendMail({ to: user.email, ...tpl });
    }
  } catch (err) {
    safeConsoleError("esqueci-senha", err);
  }

  return neutral;
}
