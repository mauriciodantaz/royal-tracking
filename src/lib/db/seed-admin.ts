import "server-only";

import bcrypt from "bcryptjs";

import { getStackAdminEmail } from "@/lib/auth/super-admin";
import { query, queryOne } from "@/lib/db/pool";

/**
 * Sync stack super admin on every boot.
 * ADMIN_EMAIL / ADMIN_PASSWORD are the source of truth (immutable in UI).
 */
export async function seedAdminIfNeeded(): Promise<void> {
  const email = getStackAdminEmail();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await queryOne<{ id: string }>(
    `select id from users where email = $1 limit 1`,
    [email]
  );

  if (existing) {
    await query(
      `update users
       set password_hash = $2,
           role = 'super_admin',
           active = true,
           name = coalesce(nullif(trim(name), ''), 'Admin'),
           updated_at = now()
       where id = $1`,
      [existing.id, passwordHash]
    );
    return;
  }

  await query(
    `insert into users (email, password_hash, name, role, active, password_set_at)
     values ($1, $2, $3, 'super_admin', true, now())
     on conflict (email) do update
       set password_hash = excluded.password_hash,
           role = 'super_admin',
           active = true,
           updated_at = now()`,
    [email, passwordHash, "Admin"]
  );
}
