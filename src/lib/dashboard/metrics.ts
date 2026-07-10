import "server-only";

import { ensureDbReady } from "@/lib/db/boot";
import { query, queryOne } from "@/lib/db/pool";

export type OverviewMetrics = {
  uniqueVisitors: number;
  eventsByType: Array<{ name: string; count: number }>;
  purchases: number;
  conversionRate: number;
  funnel: {
    visited: number;
    checkout: number;
    purchase: number;
    visitToCheckout: number;
    checkoutToPurchase: number;
    visitToPurchase: number;
  };
};

const CHECKOUT_EVENTS = new Set([
  "InitiateCheckout",
  "initiate_checkout",
  "Checkout",
  "checkout",
  "AddToCart",
]);

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  await ensureDbReady();

  const [visitorsRes, eventsRes, purchasesRes, purchaseRowsRes] =
    await Promise.all([
      queryOne<{ count: string }>(`select count(*)::text as count from visitors`),
      query<{ event_name: string; trck_user_id: string | null }>(
        `select event_name, trck_user_id from events_log`
      ),
      queryOne<{ count: string }>(
        `select count(*)::text as count from purchases
         where status is null or status not ilike '%refund%'`
      ),
      query<{ trck_user_id: string | null }>(
        `select trck_user_id from purchases where trck_user_id is not null`
      ),
    ]);

  const uniqueVisitors = Number(visitorsRes?.count ?? 0);
  const purchases = Number(purchasesRes?.count ?? 0);
  const events = eventsRes.rows;

  const byType = new Map<string, number>();
  const visitedUsers = new Set<string>();
  const checkoutUsers = new Set<string>();
  const purchaseUsers = new Set<string>();

  for (const e of events) {
    byType.set(e.event_name, (byType.get(e.event_name) ?? 0) + 1);
    if (e.trck_user_id) {
      visitedUsers.add(e.trck_user_id);
      if (CHECKOUT_EVENTS.has(e.event_name)) {
        checkoutUsers.add(e.trck_user_id);
      }
      if (e.event_name === "Purchase" || e.event_name === "purchase") {
        purchaseUsers.add(e.trck_user_id);
      }
    }
  }

  for (const p of purchaseRowsRes.rows) {
    if (p.trck_user_id) purchaseUsers.add(p.trck_user_id);
  }

  const visited = Math.max(uniqueVisitors, visitedUsers.size);
  const checkout = checkoutUsers.size;
  const purchase = purchaseUsers.size;

  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

  return {
    uniqueVisitors,
    eventsByType: [...byType.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    purchases,
    conversionRate: pct(purchases, uniqueVisitors),
    funnel: {
      visited,
      checkout,
      purchase,
      visitToCheckout: pct(checkout, visited),
      checkoutToPurchase: pct(purchase, checkout || visited),
      visitToPurchase: pct(purchase, visited),
    },
  };
}
