import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import { hashPhone } from "@/lib/tracking/hash";
import { matchVisitor, type MatchResult } from "@/lib/tracking/match";

/**
 * Resolve visitor from ticket value (coalesce columns) then phone.
 */
export async function matchVisitorFromTicket(input: {
  ticketValue: string;
  phone?: string | null;
}): Promise<MatchResult> {
  await ensureDbReady();
  const value = input.ticketValue.trim();
  if (!value) {
    return matchVisitor({ phone: input.phone });
  }

  const byCode = await queryOne<VisitorRow>(
    `select * from visitors where ticket_code = $1 limit 1`,
    [value]
  );
  if (byCode) {
    return {
      visitor: byCode,
      match_status: "matched",
      match_reason: "ticket_code",
    };
  }

  const byTrck = await queryOne<VisitorRow>(
    `select * from visitors where trck_user_id = $1 limit 1`,
    [value]
  );
  if (byTrck) {
    return {
      visitor: byTrck,
      match_status: "matched",
      match_reason: "ticket_trck_user_id",
    };
  }

  const byFbp = await queryOne<VisitorRow>(
    `select * from visitors where fbp = $1 order by updated_at desc limit 1`,
    [value]
  );
  if (byFbp) {
    return {
      visitor: byFbp,
      match_status: "matched",
      match_reason: "ticket_fbp",
    };
  }

  const byGa = await queryOne<VisitorRow>(
    `select * from visitors where ga_client_id = $1 order by updated_at desc limit 1`,
    [value]
  );
  if (byGa) {
    return {
      visitor: byGa,
      match_status: "matched",
      match_reason: "ticket_ga_client_id",
    };
  }

  const byGclid = await queryOne<VisitorRow>(
    `select * from visitors where gclid = $1 order by updated_at desc limit 1`,
    [value]
  );
  if (byGclid) {
    return {
      visitor: byGclid,
      match_status: "matched",
      match_reason: "ticket_gclid",
    };
  }

  const byTtclid = await queryOne<VisitorRow>(
    `select * from visitors where ttclid = $1 order by updated_at desc limit 1`,
    [value]
  );
  if (byTtclid) {
    return {
      visitor: byTtclid,
      match_status: "matched",
      match_reason: "ticket_ttclid",
    };
  }

  if (input.phone) {
    const phoneHash = hashPhone(input.phone);
    if (phoneHash) {
      const byPhone = await queryOne<VisitorRow>(
        `select * from visitors
         where phone_hash = $1
         order by updated_at desc
         limit 1`,
        [phoneHash]
      );
      if (byPhone) {
        return {
          visitor: byPhone,
          match_status: "matched",
          match_reason: "phone_hash",
        };
      }
    }
  }

  return {
    visitor: null,
    match_status: "unmatched",
    match_reason: "ticket_no_visitor",
  };
}
