export type PipedriveWebhookListItem = {
  id: string;
  subscriptionUrl: string;
  /** Present on the Pipedrive list, often null. Not used to decide reuse. */
  httpAuthUser?: string | null;
};

export type DealWebhookChoice =
  | { action: "reuse"; id: string }
  | { action: "create" };

export function normalizeWebhookUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Keep a listed deal webhook when its id or its URL still matches this connection. */
export function pickPipedriveDealWebhook(input: {
  storedId: string | null | undefined;
  inboundUrl: string;
  webhooks: PipedriveWebhookListItem[];
}): DealWebhookChoice {
  const want = normalizeWebhookUrl(input.inboundUrl);
  const stored =
    input.storedId != null && String(input.storedId) !== ""
      ? String(input.storedId)
      : "";

  if (stored) {
    const same = input.webhooks.find(
      (row) =>
        String(row.id) === stored &&
        normalizeWebhookUrl(row.subscriptionUrl) === want
    );
    if (same) return { action: "reuse", id: String(same.id) };
  }

  const byUrl = input.webhooks.find(
    (row) =>
      String(row.id) !== "" && normalizeWebhookUrl(row.subscriptionUrl) === want
  );
  if (byUrl) return { action: "reuse", id: String(byUrl.id) };

  return { action: "create" };
}
