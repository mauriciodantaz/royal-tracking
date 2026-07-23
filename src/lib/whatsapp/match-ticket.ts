import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { queryOne } from "@/lib/db/pool";
import type { VisitorRow } from "@/lib/db/types";
import { hashPhone } from "@/lib/tracking/hash";
import {
  matchAndMergeVisitor,
  type MatchResult,
} from "@/lib/tracking/match";

const ACTIVE = `merged_into_trck_user_id is null`;

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
    return matchAndMergeVisitor({ phone: input.phone });
  }

  const byCode = await queryOne<VisitorRow>(
    `select * from visitors where ticket_code = $1 and ${ACTIVE} limit 1`,
    [value]
  );
  if (byCode) {
    if (input.phone) {
      return matchAndMergeVisitor({
        trck_user_id: byCode.trck_user_id,
        phone: input.phone,
      });
    }
    return {
      visitor: byCode,
      match_status: "matched",
      match_reason: "ticket_code",
    };
  }

  const byTrck = await queryOne<VisitorRow>(
    `select * from visitors where trck_user_id = $1 and ${ACTIVE} limit 1`,
    [value]
  );
  if (byTrck) {
    if (input.phone) {
      return matchAndMergeVisitor({
        trck_user_id: byTrck.trck_user_id,
        phone: input.phone,
      });
    }
    return {
      visitor: byTrck,
      match_status: "matched",
      match_reason: "ticket_trck_user_id",
    };
  }

  const byFbp = await queryOne<VisitorRow>(
    `select * from visitors where fbp = $1 and ${ACTIVE}
     order by updated_at desc limit 1`,
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
    `select * from visitors where ga_client_id = $1 and ${ACTIVE}
     order by updated_at desc limit 1`,
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
    `select * from visitors where gclid = $1 and ${ACTIVE}
     order by updated_at desc limit 1`,
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
    `select * from visitors where ttclid = $1 and ${ACTIVE}
     order by updated_at desc limit 1`,
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
      return matchAndMergeVisitor({ phone: input.phone });
    }
  }

  return {
    visitor: null,
    match_status: "unmatched",
    match_reason: "ticket_no_visitor",
  };
}

/** Match visitor for Click-to-WhatsApp (no ticket in message text). */
export async function matchVisitorFromCtwa(input: {
  ctwaClid?: string | null;
  phone?: string | null;
}): Promise<MatchResult> {
  await ensureDbReady();
  const clid = input.ctwaClid?.trim();
  if (clid) {
    const byCtwa = await queryOne<VisitorRow>(
      `select * from visitors where ctwa_clid = $1 and ${ACTIVE}
       order by updated_at desc limit 1`,
      [clid]
    );
    if (byCtwa) {
      if (input.phone) {
        return matchAndMergeVisitor({
          trck_user_id: byCtwa.trck_user_id,
          phone: input.phone,
        });
      }
      return {
        visitor: byCtwa,
        match_status: "matched",
        match_reason: "ctwa_clid",
      };
    }
  }

  if (input.phone) {
    return matchAndMergeVisitor({ phone: input.phone });
  }

  return {
    visitor: null,
    match_status: "unmatched",
    match_reason: clid ? "ctwa_no_visitor" : "ctwa_missing",
  };
}
