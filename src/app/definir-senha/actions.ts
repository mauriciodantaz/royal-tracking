"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import {
  findValidAuthToken,
  markAuthTokenUsed,
} from "@/lib/auth/tokens";
import { isStackSuperAdmin } from "@/lib/auth/super-admin";
import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { UserRow } from "@/lib/db/types";

export type SetPasswordResult = { error?: string };

export async function setPasswordAction(
  _prev: SetPasswordResult | undefined,
  formData: FormData
): Promise<SetPasswordResult> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "Link inválido ou expirado." };
  if (password.length < 8) {
    return { error: "A senha deve ter pelo menos 8 caracteres." };
  }
  if (password !== confirm) {
    return { error: "As senhas não coincidem." };
  }

  await ensureDbReady();
  const found = await findValidAuthToken(token, ["invite", "reset"]);
  if (!found) {
    return { error: "Link inválido ou expirado." };
  }

  const user = await queryOne<UserRow>(
    `select * from users where id = $1 limit 1`,
    [found.userId]
  );
  if (!user || !user.active) {
    return { error: "Usuário inválido ou inativo." };
  }
  if (isStackSuperAdmin(user.email) || user.role === "super_admin") {
    return {
      error: "A senha do super admin é definida na instalação do sistema.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `update users
     set password_hash = $2,
         password_set_at = now(),
         updated_at = now()
     where id = $1`,
    [user.id, passwordHash]
  );
  await markAuthTokenUsed(found.id);

  redirect("/login?reset=1");
}
