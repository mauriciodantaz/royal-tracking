"use server";

import { createHash } from "node:crypto";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIpFromHeaders } from "@/lib/tracking/request";

function emailKey(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);
}

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard") || "/dashboard";

  const h = await headers();
  const ip = getClientIpFromHeaders(h);
  const ipLimit = rateLimit(`login:ip:${ip}`, 20, 60_000);
  const emailLimit = email
    ? rateLimit(`login:email:${emailKey(email)}`, 10, 60_000)
    : { ok: true };
  if (!ipLimit.ok || !emailLimit.ok) {
    return { error: "Muitas tentativas. Aguarde um minuto e tente de novo." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: next.startsWith("/") ? next : "/dashboard",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "E-mail ou senha inválidos" };
    }
    throw err;
  }
  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
