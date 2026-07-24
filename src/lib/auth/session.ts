import "server-only";

import { auth } from "@/auth";
import { isStackSuperAdmin } from "@/lib/auth/super-admin";
import { ensureDbReady } from "@/lib/db/boot";
import { queryOne } from "@/lib/db/pool";
import type { UserRole } from "@/lib/db/types";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: UserRole;
};

type DbSessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
};

function normalizeRole(role: string | null | undefined): UserRole {
  return role === "super_admin" ? "super_admin" : "manager";
}

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  await ensureDbReady();

  const row = await queryOne<DbSessionUser>(
    `select id, email, name, role, active from users where id = $1 limit 1`,
    [session.user.id]
  );
  if (!row || !row.active) {
    throw new Error("unauthorized");
  }

  let role = normalizeRole(row.role);
  if (isStackSuperAdmin(row.email)) {
    role = "super_admin";
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
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
