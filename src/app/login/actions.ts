"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard") || "/dashboard";

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
