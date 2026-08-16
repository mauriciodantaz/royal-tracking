import type { MetaCustomData } from "@/lib/meta/capi";

export type Ga4MpEventInput = {
  eventName: string;
  eventId: string;
  clientId: string;
  customData?: MetaCustomData;
  gaSessionId?: string | null;
  userId?: string | null;
  transactionId?: string | null;
};

function ga4ItemsFromCustomData(
  customData: MetaCustomData | undefined
): Record<string, unknown>[] | undefined {
  if (customData?.items && customData.items.length > 0) {
    return customData.items.map((item) => ({
      item_id: item.item_id,
      item_name: item.item_name,
      quantity: item.quantity ?? 1,
      price: item.price ?? 0,
    }));
  }
  if (customData?.content_ids && customData.content_ids.length > 0) {
    return customData.content_ids.map((id) => ({
      item_id: id,
      item_name: customData.content_name,
    }));
  }
  return undefined;
}

/** Measurement Protocol body (no extra root fields — Google may reject unknowns). */
export function buildGa4MpPayload(input: Ga4MpEventInput): {
  client_id: string;
  user_id?: string;
  events: [{ name: string; params: Record<string, unknown> }];
} {
  const eventParams: Record<string, unknown> = {
    engagement_time_msec: 1,
  };
  if (input.customData?.value != null) eventParams.value = input.customData.value;
  if (input.customData?.currency) eventParams.currency = input.customData.currency;
  const items = ga4ItemsFromCustomData(input.customData);
  if (items) eventParams.items = items;
  if (input.gaSessionId) eventParams.session_id = input.gaSessionId;
  eventParams.event_id = input.eventId;
  const isPurchase =
    input.eventName === "purchase" || input.eventName === "Purchase";
  if (isPurchase) {
    eventParams.transaction_id = input.transactionId || input.eventId;
  }

  const payload: {
    client_id: string;
    user_id?: string;
    events: [{ name: string; params: Record<string, unknown> }];
  } = {
    client_id: input.clientId,
    events: [{ name: input.eventName, params: eventParams }],
  };
  if (input.userId) payload.user_id = input.userId;
  return payload;
}
