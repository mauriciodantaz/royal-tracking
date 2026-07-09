import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hashEmail, hashPhone } from "@/lib/tracking/hash";
import type { Database } from "@/lib/supabase/database.types";

type Visitor = Database["public"]["Tables"]["visitors"]["Row"];

export type MatchResult = {
  visitor: Visitor | null;
  match_status: "matched" | "unmatched";
  match_reason: string;
};

export async function matchVisitor(input: {
  trck_user_id?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<MatchResult> {
  const admin = createAdminClient();

  if (input.trck_user_id) {
    const { data } = await admin
      .from("visitors")
      .select("*")
      .eq("trck_user_id", input.trck_user_id)
      .maybeSingle();
    if (data) {
      return {
        visitor: data,
        match_status: "matched",
        match_reason: "trck_user_id",
      };
    }
  }

  const emailHash = hashEmail(input.email);
  if (emailHash) {
    const { data } = await admin
      .from("visitors")
      .select("*")
      .eq("email_hash", emailHash)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        visitor: data,
        match_status: "matched",
        match_reason: "email_hash",
      };
    }
  }

  const phoneHash = hashPhone(input.phone);
  if (phoneHash) {
    const { data } = await admin
      .from("visitors")
      .select("*")
      .eq("phone_hash", phoneHash)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        visitor: data,
        match_status: "matched",
        match_reason: "phone_hash",
      };
    }
  }

  return {
    visitor: null,
    match_status: "unmatched",
    match_reason: "no_visitor",
  };
}
