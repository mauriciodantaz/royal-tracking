import "server-only";

import { auth } from "@/auth";
import { ensureDbReady } from "@/lib/db/boot";
import { isStackSuperAdmin, type UserRole } from "@/lib/auth/super-admin";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: UserRole;
};

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  await ensureDbReady();
  const role: UserRole =
    session.user.role === "super_admin" ? "super_admin" : "manager";
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role,
  };
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "super_admin" && !isStackSuperAdmin(user.email)) {
    throw new Error("forbidden");
  }
  return user;
}
