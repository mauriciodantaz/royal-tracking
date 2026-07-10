import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import { hashEmail, hashPhone } from "@/lib/tracking/hash";

export type MatchResult = {
  visitor: VisitorRow | null;
  match_status: "matched" | "unmatched";
  match_reason: string;
};

export async function matchVisitor(input: {
  trck_user_id?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<MatchResult> {
  await ensureDbReady();

  if (input.trck_user_id) {
    const data = await queryOne<VisitorRow>(
      `select * from visitors where trck_user_id = $1 limit 1`,
      [input.trck_user_id]
    );
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
    const data = await queryOne<VisitorRow>(
      `select * from visitors
       where email_hash = $1
       order by updated_at desc
       limit 1`,
      [emailHash]
    );
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
    const data = await queryOne<VisitorRow>(
      `select * from visitors
       where phone_hash = $1
       order by updated_at desc
       limit 1`,
      [phoneHash]
    );
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
