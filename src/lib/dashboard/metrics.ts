import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

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
  const admin = createAdminClient();

  const [visitorsRes, eventsRes, purchasesRes] = await Promise.all([
    admin.from("visitors").select("trck_user_id", { count: "exact", head: true }),
    admin.from("events_log").select("event_name, trck_user_id"),
    admin
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .not("status", "ilike", "%refund%"),
  ]);

  const uniqueVisitors = visitorsRes.count ?? 0;
  const purchases = purchasesRes.count ?? 0;
  const events = eventsRes.data ?? [];

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

  // Also count purchase table users
  const { data: purchaseRows } = await admin
    .from("purchases")
    .select("trck_user_id")
    .not("trck_user_id", "is", null);
  for (const p of purchaseRows ?? []) {
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
