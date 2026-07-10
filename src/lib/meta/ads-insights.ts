import "server-only";

import { decryptSecret } from "@/lib/crypto/secrets";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type { MetaAdAccountRow } from "@/lib/db/types";
import { META_GRAPH_BASE_URL } from "@/lib/meta/constants";

type CacheEntry = { at: number; data: AdsInsightsResult };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60_000; // 30 min — spaced refresh
const MIN_GAP_MS = 10_000; // conservative gap between Meta calls
let lastCallAt = 0;

export type AdNode = {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  revenue: number;
  purchases: number;
  roas: number;
  cpa: number;
};

export type AdSetNode = AdNode & { ads: AdNode[] };
export type CampaignNode = AdNode & { adsets: AdSetNode[] };

export type AdsInsightsResult = {
  accountId: string;
  label: string;
  fetchedAt: string;
  campaigns: CampaignNode[];
  usageHeader?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function conservativeFetch(url: string): Promise<Response> {
  const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCallAt));
  if (wait) await sleep(wait);
  lastCallAt = Date.now();
  const res = await fetch(url);
  const usage = res.headers.get("x-business-use-case-usage");
  if (usage) {
    try {
      const parsed = JSON.parse(usage) as Record<
        string,
        Array<{ call_count?: number; total_cputime?: number; total_time?: number }>
      >;
      for (const entries of Object.values(parsed)) {
        for (const e of entries ?? []) {
          const max = Math.max(
            e.call_count ?? 0,
            e.total_cputime ?? 0,
            e.total_time ?? 0
          );
          if (max >= 50) {
            // Back off early — well below Meta's documented ceiling
            await sleep(5_000);
          }
        }
      }
    } catch {
      /* ignore parse */
    }
  }
  return res;
}

async function fetchInsightsLevel(opts: {
  actId: string;
  token: string;
  level: "campaign" | "adset" | "ad";
  since: string;
  until: string;
}) {
  const fields =
    "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks";
  const params = new URLSearchParams({
    level: opts.level,
    fields,
    time_range: JSON.stringify({ since: opts.since, until: opts.until }),
    limit: "100",
    access_token: opts.token,
  });
  const url = `${META_GRAPH_BASE_URL}/act_${opts.actId}/insights?${params}`;
  const res = await conservativeFetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Meta insights ${res.status}`);
  }
  return {
    rows: (body.data ?? []) as Array<Record<string, string>>,
    usage: res.headers.get("x-business-use-case-usage") ?? undefined,
  };
}

function emptyNode(id: string, name: string): AdNode {
  return {
    id,
    name,
    spend: 0,
    impressions: 0,
    clicks: 0,
    revenue: 0,
    purchases: 0,
    roas: 0,
    cpa: 0,
  };
}

function finalize(node: AdNode) {
  node.roas = node.spend > 0 ? node.revenue / node.spend : 0;
  node.cpa = node.purchases > 0 ? node.spend / node.purchases : 0;
}

export async function getAdsInsightsTree(opts: {
  accountId?: string | null;
  force?: boolean;
}): Promise<AdsInsightsResult[]> {
  await ensureDbReady();

  const accountsResult =
    opts.accountId && opts.accountId !== "all"
      ? await query<MetaAdAccountRow>(
          `select * from meta_ad_accounts where active = true and id = $1`,
          [opts.accountId]
        )
      : await query<MetaAdAccountRow>(
          `select * from meta_ad_accounts where active = true`
        );
  const accounts = accountsResult.rows;

  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);

  const purchasesResult = await query<{
    value: number | null;
    utm_campaign: string | null;
    status: string | null;
    created_at: string;
  }>(
    `select value, utm_campaign, status, created_at
     from purchases where created_at >= $1`,
    [`${since}T00:00:00Z`]
  );

  const revenueByCampaign = new Map<string, { revenue: number; count: number }>();
  for (const p of purchasesResult.rows) {
    if (p.status && /refund|reembolso|chargeback/i.test(p.status)) continue;
    const key = (p.utm_campaign ?? "").toLowerCase();
    if (!key) continue;
    const cur = revenueByCampaign.get(key) ?? { revenue: 0, count: 0 };
    cur.revenue += Number(p.value ?? 0);
    cur.count += 1;
    revenueByCampaign.set(key, cur);
  }

  const results: AdsInsightsResult[] = [];

  for (const account of accounts ?? []) {
    const cacheKey = `${account.id}:${since}:${until}`;
    const hit = cache.get(cacheKey);
    if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
      results.push(hit.data);
      continue;
    }
    if (!account.ads_token_cipher) continue;

    const token = await decryptSecret(account.ads_token_cipher as string);
    const actId = account.ad_account_id.replace(/^act_/, "");

    const [campaignsRes, adsetsRes, adsRes] = await Promise.all([
      fetchInsightsLevel({
        actId,
        token,
        level: "campaign",
        since,
        until,
      }),
      fetchInsightsLevel({ actId, token, level: "adset", since, until }),
      fetchInsightsLevel({ actId, token, level: "ad", since, until }),
    ]);

    const campaignMap = new Map<string, CampaignNode>();

    for (const row of campaignsRes.rows) {
      const id = row.campaign_id;
      const node: CampaignNode = {
        ...emptyNode(id, row.campaign_name || id),
        adsets: [],
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
      };
      const rev = revenueByCampaign.get((row.campaign_name || "").toLowerCase());
      if (rev) {
        node.revenue = rev.revenue;
        node.purchases = rev.count;
      }
      finalize(node);
      campaignMap.set(id, node);
    }

    const adsetMap = new Map<string, AdSetNode>();
    for (const row of adsetsRes.rows) {
      const parent = campaignMap.get(row.campaign_id);
      if (!parent) continue;
      const node: AdSetNode = {
        ...emptyNode(row.adset_id, row.adset_name || row.adset_id),
        ads: [],
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
      };
      finalize(node);
      parent.adsets.push(node);
      adsetMap.set(row.adset_id, node);
    }

    for (const row of adsRes.rows) {
      const parent = adsetMap.get(row.adset_id);
      if (!parent) continue;
      const node: AdNode = {
        ...emptyNode(row.ad_id, row.ad_name || row.ad_id),
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
      };
      finalize(node);
      parent.ads.push(node);
    }

    const result: AdsInsightsResult = {
      accountId: account.id,
      label: account.label,
      fetchedAt: new Date().toISOString(),
      campaigns: [...campaignMap.values()],
      usageHeader: campaignsRes.usage,
    };
    cache.set(cacheKey, { at: Date.now(), data: result });
    results.push(result);
  }

  return results;
}
