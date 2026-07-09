/** Resolve Supabase URL from public or server env names. */
export function getSupabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  if (!url) {
    throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
  }
  return url;
}

/** Anon key — safe for browser when exposed as NEXT_PUBLIC_. */
export function getSupabaseAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";
  if (!key) {
    throw new Error("Missing SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return key;
}
