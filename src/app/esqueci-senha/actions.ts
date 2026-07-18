"use server";

import {
  createAuthToken,
  RESET_TTL_MS,
} from "@/lib/auth/tokens";
import { isStackSuperAdmin } from "@/lib/auth/super-admin";
import { ensureDbReady } from "@/lib/db/boot";
import { queryOne } from "@/lib/db/pool";
import type { UserRow } from "@/lib/db/types";
import { resetEmail } from "@/lib/mail/templates";
import { isSmtpConfigured, sendMail } from "@/lib/mail/smtp";

export type ForgotResult = { ok: true; message: string };

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

  if (!email) return neutral;

  if (isStackSuperAdmin(email)) {
    return {
      ok: true,
      message:
        "A senha do super admin é definida na instalação do sistema e não pode ser redefinida por e-mail.",
    };
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
    console.error("[esqueci-senha]", err);
  }

  return neutral;
}
