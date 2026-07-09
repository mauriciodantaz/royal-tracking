import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

function encryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 16) {
    throw new Error("ENCRYPTION_KEY missing or too short (min 16 chars)");
  }
  return key;
}

/** Encrypt plaintext via pgcrypto (server-only). Returns hex for storage. */
export async function encryptSecret(plain: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("encrypt_secret", {
    plain,
    secret_key: encryptionKey(),
  });
  if (error) throw error;
  return data as string;
}

/** Decrypt cipher (hex/bytea) via pgcrypto (server-only). */
export async function decryptSecret(cipher: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("decrypt_secret", {
    cipher,
    secret_key: encryptionKey(),
  });
  if (error) throw error;
  return data as string;
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••••••${value.slice(-4)}`;
}
