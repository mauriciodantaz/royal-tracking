export type NormalizedPurchase = {
  transaction_id: string;
  value: number;
  currency: string;
  status: string;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  product_name?: string | null;
  product_id?: string | null;
  trck_user_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  provider: "hotmart" | "kiwify" | "eduzz" | "generic";
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

/** Generic Hotmart / Kiwify / Eduzz-ish payload normalizer. */
export function parsePurchaseWebhook(raw: unknown): NormalizedPurchase | null {
  const root = asRecord(raw);
  if (!root) return null;

  // Hotmart-style
  const hotmartData = asRecord(root.data);
  if (root.event || hotmartData?.purchase || hotmartData?.buyer) {
    const purchase = asRecord(hotmartData?.purchase) ?? hotmartData;
    const buyer = asRecord(hotmartData?.buyer) ?? asRecord(root.buyer);
    const product = asRecord(hotmartData?.product) ?? asRecord(root.product);
    const transactionId =
      str(purchase?.transaction) ??
      str(purchase?.transaction_id) ??
      str(root.transaction_id);
    const priceObj = asRecord(purchase?.price);
    const value =
      num(priceObj?.value) ??
      num(purchase?.value) ??
      num(root.value);
    if (!transactionId || value === null) return null;
    return {
      provider: "hotmart",
      transaction_id: transactionId,
      value,
      currency:
        str(asRecord(purchase?.price)?.currency_value) ??
        str(purchase?.currency) ??
        str(root.currency) ??
        "BRL",
      status:
        str(purchase?.status) ??
        str(root.event) ??
        str(root.status) ??
        "approved",
      email: str(buyer?.email) ?? str(root.email),
      phone: str(buyer?.checkout_phone) ?? str(buyer?.phone) ?? str(root.phone),
      first_name: str(buyer?.first_name) ?? str(buyer?.name),
      last_name: str(buyer?.last_name),
      product_name: str(product?.name) ?? str(root.product_name),
      product_id: str(product?.id) ?? str(root.product_id),
      trck_user_id:
        str(root.trck_user_id) ??
        str(asRecord(root.metadata)?.trck_user_id) ??
        str(asRecord(purchase?.tracking)?.trck_user_id),
      utm_source: str(root.utm_source) ?? str(asRecord(purchase?.tracking)?.source),
      utm_medium: str(root.utm_medium),
      utm_campaign: str(root.utm_campaign),
      utm_term: str(root.utm_term),
      utm_content: str(root.utm_content),
    };
  }

  // Kiwify-style
  if (root.order_id || root.Customer || root.Product) {
    const customer = asRecord(root.Customer) ?? asRecord(root.customer);
    const product = asRecord(root.Product) ?? asRecord(root.product);
    const transactionId =
      str(root.order_id) ?? str(root.transaction_id) ?? str(root.id);
    const value =
      num(product?.price) ??
      num(root.amount) ??
      num(root.value);
    if (!transactionId || value === null) return null;
    return {
      provider: "kiwify",
      transaction_id: transactionId,
      value,
      currency: str(root.currency) ?? "BRL",
      status: str(root.order_status) ?? str(root.status) ?? "paid",
      email: str(customer?.email),
      phone: str(customer?.mobile) ?? str(customer?.phone),
      first_name: str(customer?.full_name) ?? str(customer?.first_name),
      last_name: str(customer?.last_name),
      product_name: str(product?.product_name) ?? str(product?.name),
      product_id: str(product?.product_id) ?? str(product?.id),
      trck_user_id:
        str(root.trck_user_id) ??
        str(asRecord(root.TrackingParameters)?.trck_user_id) ??
        str(asRecord(root.custom_fields)?.trck_user_id),
      utm_source: str(asRecord(root.TrackingParameters)?.utm_source),
      utm_medium: str(asRecord(root.TrackingParameters)?.utm_medium),
      utm_campaign: str(asRecord(root.TrackingParameters)?.utm_campaign),
      utm_term: str(asRecord(root.TrackingParameters)?.utm_term),
      utm_content: str(asRecord(root.TrackingParameters)?.utm_content),
    };
  }

  // Eduzz / generic flat
  const transactionId =
    str(root.transaction_id) ??
    str(root.trans_cod) ??
    str(root.order_id) ??
    str(root.id);
  const value = num(root.value) ?? num(root.amount) ?? num(root.price);
  if (!transactionId || value === null) return null;

  return {
    provider: "generic",
    transaction_id: transactionId,
    value,
    currency: str(root.currency) ?? "BRL",
    status: str(root.status) ?? "approved",
    email: str(root.email) ?? str(root.buyer_email),
    phone: str(root.phone) ?? str(root.buyer_phone),
    first_name: str(root.first_name) ?? str(root.name),
    last_name: str(root.last_name),
    product_name: str(root.product_name) ?? str(root.product),
    product_id: str(root.product_id),
    trck_user_id: str(root.trck_user_id),
    utm_source: str(root.utm_source),
    utm_medium: str(root.utm_medium),
    utm_campaign: str(root.utm_campaign),
    utm_term: str(root.utm_term),
    utm_content: str(root.utm_content),
  };
}
