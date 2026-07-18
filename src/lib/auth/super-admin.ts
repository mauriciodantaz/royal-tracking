import "server-only";

/** Stack super admin email (normalized). Empty if ADMIN_EMAIL unset. */
export function getStackAdminEmail(): string {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
}

export function isStackSuperAdmin(email: string | null | undefined): boolean {
  const admin = getStackAdminEmail();
  if (!admin || !email) return false;
  return email.trim().toLowerCase() === admin;
}

export type UserRole = "super_admin" | "manager";
