import "server-only";

import bcrypt from "bcryptjs";

import { query, queryOne } from "@/lib/db/pool";

/** Seed admin from ADMIN_EMAIL / ADMIN_PASSWORD on first boot (if no users). */
export async function seedAdminIfNeeded(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = await queryOne<{ count: string }>(
    `select count(*)::text as count from users`
  );
  if (existing && Number(existing.count) > 0) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `insert into users (email, password_hash, name)
     values ($1, $2, $3)
     on conflict (email) do nothing`,
    [email, passwordHash, "Admin"]
  );
}
