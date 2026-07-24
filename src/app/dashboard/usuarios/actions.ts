"use server";

import { revalidatePath } from "next/cache";

import { auditLog } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/permissions";
import {
  createAuthToken,
  INVITE_TTL_MS,
} from "@/lib/auth/tokens";
import { isStackSuperAdmin } from "@/lib/auth/super-admin";
import { query, queryOne } from "@/lib/db/pool";
import type { UserRow } from "@/lib/db/types";
import { safeActionMessage } from "@/lib/http/public-error";
import { inviteEmail } from "@/lib/mail/templates";
import { isSmtpConfigured, sendMail } from "@/lib/mail/smtp";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateUsers() {
  revalidatePath("/dashboard/usuarios");
}

async function sendInviteMail(user: UserRow): Promise<ActionResult> {
  if (!isSmtpConfigured()) {
    return {
      ok: false,
      error:
        "O envio de e-mail ainda não está configurado. Peça ao administrador da instalação para ativá-lo.",
    };
  }
  const token = await createAuthToken({
    userId: user.id,
    purpose: "invite",
    ttlMs: INVITE_TTL_MS,
  });
  const tpl = inviteEmail({ name: user.name, token });
  try {
    await sendMail({ to: user.email, ...tpl });
  } catch (err) {
    return { ok: false, error: safeActionMessage(err, "Falha ao enviar e-mail") };
  }
  await query(
    `update users set invited_at = now(), updated_at = now() where id = $1`,
    [user.id]
  );
  return { ok: true };
}

export async function inviteUserAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let actor;
  try {
    actor = await requirePermission("users:manage");
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }

  const name = String(formData.get("name") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "E-mail inválido." };
  }
  if (isStackSuperAdmin(email)) {
    return {
      ok: false,
      error: "Este e-mail é do super admin e não pode ser convidado.",
    };
  }

  const existing = await queryOne<UserRow>(
    `select * from users where email = $1 limit 1`,
    [email]
  );
  if (existing) {
    return { ok: false, error: "Já existe um usuário com este e-mail." };
  }

  const inserted = await queryOne<UserRow>(
    `insert into users (email, name, role, active, password_hash, invited_at)
     values ($1, $2, 'manager', true, null, now())
     returning *`,
    [email, name]
  );
  if (!inserted) {
    return { ok: false, error: "Não foi possível criar o usuário." };
  }

  const mail = await sendInviteMail(inserted);
  await auditLog({
    actorUserId: actor.id,
    action: "user.invite",
    resourceType: "user",
    resourceId: inserted.id,
    result: mail.ok ? "ok" : "error",
    meta: { email },
  });
  revalidateUsers();
  if (!mail.ok) {
    return {
      ok: false,
      error: `Usuário criado, mas o convite falhou: ${mail.error}`,
    };
  }
  return { ok: true };
}

export async function resendInviteAction(userId: string): Promise<ActionResult> {
  let actor;
  try {
    actor = await requirePermission("users:manage");
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }

  const user = await queryOne<UserRow>(
    `select * from users where id = $1 limit 1`,
    [userId]
  );
  if (!user) return { ok: false, error: "Usuário não encontrado." };
  if (isStackSuperAdmin(user.email) || user.role === "super_admin") {
    return { ok: false, error: "Não é possível convidar o super admin." };
  }
  if (user.password_set_at) {
    return {
      ok: false,
      error: "Este usuário já definiu senha. Use a recuperação de senha.",
    };
  }

  const mail = await sendInviteMail(user);
  await auditLog({
    actorUserId: actor.id,
    action: "user.invite_resend",
    resourceType: "user",
    resourceId: user.id,
    result: mail.ok ? "ok" : "error",
  });
  revalidateUsers();
  return mail;
}

export async function setUserActiveAction(
  userId: string,
  active: boolean
): Promise<ActionResult> {
  let actor;
  try {
    actor = await requirePermission("users:manage");
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }

  const user = await queryOne<UserRow>(
    `select * from users where id = $1 limit 1`,
    [userId]
  );
  if (!user) return { ok: false, error: "Usuário não encontrado." };
  if (isStackSuperAdmin(user.email) || user.role === "super_admin") {
    return { ok: false, error: "O super admin não pode ser alterado aqui." };
  }

  await query(
    `update users set active = $2, updated_at = now() where id = $1`,
    [userId, active]
  );
  await auditLog({
    actorUserId: actor.id,
    action: active ? "user.activate" : "user.deactivate",
    resourceType: "user",
    resourceId: userId,
  });
  revalidateUsers();
  return { ok: true };
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  let actor;
  try {
    actor = await requirePermission("users:manage");
  } catch (err) {
    return { ok: false, error: safeActionMessage(err) };
  }

  const user = await queryOne<UserRow>(
    `select * from users where id = $1 limit 1`,
    [userId]
  );
  if (!user) return { ok: false, error: "Usuário não encontrado." };
  if (isStackSuperAdmin(user.email) || user.role === "super_admin") {
    return { ok: false, error: "O super admin não pode ser excluído." };
  }

  await query(`delete from users where id = $1`, [userId]);
  await auditLog({
    actorUserId: actor.id,
    action: "user.delete",
    resourceType: "user",
    resourceId: userId,
  });
  revalidateUsers();
  return { ok: true };
}
