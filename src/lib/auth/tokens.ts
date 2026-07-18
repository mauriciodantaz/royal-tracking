import "server-only";

import { createHash, randomBytes } from "crypto";

import { query, queryOne } from "@/lib/db/pool";

export type AuthTokenPurpose = "invite" | "reset";

export type AuthTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  purpose: AuthTokenPurpose;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createAuthToken(opts: {
  userId: string;
  purpose: AuthTokenPurpose;
  ttlMs: number;
}): Promise<string> {
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + opts.ttlMs).toISOString();

  // Invalidate previous unused tokens of same purpose for this user
  await query(
    `update auth_tokens
     set used_at = now()
     where user_id = $1 and purpose = $2 and used_at is null`,
    [opts.userId, opts.purpose]
  );

  await query(
    `insert into auth_tokens (user_id, token_hash, purpose, expires_at)
     values ($1, $2, $3, $4)`,
    [opts.userId, tokenHash, opts.purpose, expiresAt]
  );

  return raw;
}

export async function findValidAuthToken(
  raw: string,
  purposes: AuthTokenPurpose[]
): Promise<{ id: string; userId: string; purpose: AuthTokenPurpose } | null> {
  const tokenHash = hashToken(raw);
  const row = await queryOne<AuthTokenRow>(
    `select * from auth_tokens
     where token_hash = $1
       and used_at is null
       and expires_at > now()
       and purpose = any($2::text[])
     limit 1`,
    [tokenHash, purposes]
  );
  if (!row) return null;
  return { id: row.id, userId: row.user_id, purpose: row.purpose };
}

export async function markAuthTokenUsed(tokenId: string): Promise<void> {
  await query(`update auth_tokens set used_at = now() where id = $1`, [
    tokenId,
  ]);
}

export async function consumeAuthToken(
  raw: string,
  purposes: AuthTokenPurpose[]
): Promise<{ userId: string; purpose: AuthTokenPurpose } | null> {
  const found = await findValidAuthToken(raw, purposes);
  if (!found) return null;
  await markAuthTokenUsed(found.id);
  return { userId: found.userId, purpose: found.purpose };
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
