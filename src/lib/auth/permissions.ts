import "server-only";

import {
  requireSuperAdmin,
  requireUser,
  type SessionUser,
} from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/types";

export type Permission =
  | "dashboard:read"
  | "integrations:manage"
  | "links:manage"
  | "users:manage"
  | "settings:manage";

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  super_admin: [
    "dashboard:read",
    "integrations:manage",
    "links:manage",
    "users:manage",
    "settings:manage",
  ],
  manager: [
    "dashboard:read",
    "integrations:manage",
    "links:manage",
    "settings:manage",
  ],
};

export function roleHasPermission(
  role: UserRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export async function requirePermission(
  permission: Permission
): Promise<SessionUser> {
  if (permission === "users:manage") {
    return requireSuperAdmin();
  }
  const user = await requireUser();
  if (!roleHasPermission(user.role, permission)) {
    throw new Error("forbidden");
  }
  return user;
}
