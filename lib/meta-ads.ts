import { createHmac } from "node:crypto";

export type AdsMetric = {
  spend: number;
  impressions: number;
  clicks: number;
  results: number | null;
  revenue: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  costPerResult: number | null;
  roas: number | null;
};

export type AdsCampaign = {
  id: string;
  name: string;
  status: string;
  objective: string;
  metrics: AdsMetric | null;
};

export type AdsDaily = { date: string; metrics: AdsMetric };

export type AdsReport = {
  configured: true;
  account: { id: string; name: string; currency: string; timezone: string };
  period: { since: string; until: string };
  resultActionType: string | null;
  revenueActionType: string | null;
  fetchedAt: string;
  totals: AdsMetric;
  campaigns: AdsCampaign[];
  daily: AdsDaily[];
};

type Action = { action_type?: string; value?: string };
type MetaAccount = { id: string; name: string; currency: string; timezone_name: string };
type MetaCampaign = { id: string; name: string; effective_status: string; objective: string };
type MetaInsight = {
  campaign_id: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Action[];
  action_values?: Action[];
};

export class AdsConfigurationError extends Error {}

export function missingMetaConfiguration(): string[] {
  const required = ["META_GRAPH_API_VERSION", "META_AD_ACCOUNT_ID", "META_ACCESS_TOKEN"] as const;
  return required.filter((key) => !process.env[key]?.trim());
}

function configuration() {
  const missing = missingMetaConfiguration();
  if (missing.length) throw new AdsConfigurationError(`Thiếu cấu hình: ${missing.join(", ")}.`);
  const version = process.env.META_GRAPH_API_VERSION!.trim();
  const accountId = process.env.META_AD_ACCOUNT_ID!.trim().replace(/^act_/, "");
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(accountId)) {
    throw new AdsConfigurationError("Phiên bản Graph API hoặc mã tài khoản quảng cáo chưa hợp lệ.");
  }
  return {
    version,
    accountId,
    token: process.env.META_ACCESS_TOKEN!.trim(),
    secret: process.env.META_APP_SECRET?.trim(),
    resultActionType: process.env.META_RESULT_ACTION_TYPE?.trim() || null,
    revenueActionType: process.env.META_REVENUE_ACTION_TYPE?.trim() || null
  };
}

type Config = ReturnType<typeof configuration>;

async function graphGet<T>(config: Config, resource: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${config.version}/${resource}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  if (config.secret) url.searchParams.set("appsecret_proof", createHmac("sha256", config.secret).update(config.token).digest("hex"));
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
  } catch {
    throw new Error("Không thể kết nối Meta Ads. Vui lòng thử lại.");
  }
  if (!response.ok) {
    // Avoid returning the upstream request URL or token in a response to the browser.
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error("Meta từ chối yêu cầu. Kiểm tra quyền ads_read, tài khoản, access token và phiên bản API.");
    }
    throw new Error(`Meta Ads tạm thời không phản hồi (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

async function graphList<T>(config: Config, resource: string, query: Record<string, string>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  const visited = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const result = await graphGet<{ data?: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(
      config, resource, { ...query, limit: "100", ...(cursor ? { after: cursor } : {}) }
    );
    all.push(...(result.data ?? []));
    if (!result.paging?.next) return all;
    cursor = result.paging.cursors?.after;
    if (!cursor || visited.has(cursor)) throw new Error("Không thể đọc hết các trang dữ liệu Meta Ads.");
    visited.add(cursor);
  }
  throw new Error("Khoảng ngày có quá nhiều dữ liệu. Hãy thu hẹp khoảng ngày để xem đầy đủ số liệu.");
}

function number(value: string | undefined) {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < 0) throw new Error("Meta trả về chỉ số không hợp lệ. Hãy thử tải lại báo cáo.");
  return result;
}

function actionValue(actions: Action[] | undefined, actionType: string | null): number | null {
  if (!actionType) return null;
  return (actions ?? []).filter((action) => action.action_type === actionType).reduce((sum, action) => sum + number(action.value), 0);
}

type Additive = Pick<AdsMetric, "spend" | "impressions" | "clicks" | "results" | "revenue">;

function emptyMetric(hasResults: boolean, hasRevenue: boolean): Additive {
  return { spend: 0, impressions: 0, clicks: 0, results: hasResults ? 0 : null, revenue: hasRevenue ? 0 : null };
}

function add(target: Additive, source: Additive) {
  target.spend += source.spend;
  target.impressions += source.impressions;
  target.clicks += source.clicks;
  if (target.results !== null && source.results !== null) target.results += source.results;
  if (target.revenue !== null && source.revenue !== null) target.revenue += source.revenue;
}

export function completeMetric(value: Additive): AdsMetric {
  return {
    ...value,
    ctr: value.impressions ? value.clicks / value.impressions : null,
    cpc: value.clicks ? value.spend / value.clicks : null,
    cpm: value.impressions ? value.spend * 1000 / value.impressions : null,
    costPerResult: value.results ? value.spend / value.results : null,
    roas: value.revenue !== null && value.spend ? value.revenue / value.spend : null
  };
}

export async function getMetaAdsReport(since: string, until: string): Promise<AdsReport> {
  const config = configuration();
  const resource = `act_${config.accountId}`;
  const [account, campaigns, insights] = await Promise.all([
    graphGet<MetaAccount>(config, resource, { fields: "id,name,currency,timezone_name" }),
    graphList<MetaCampaign>(config, `${resource}/campaigns`, { fields: "id,name,effective_status,objective" }),
    graphList<MetaInsight>(config, `${resource}/insights`, {
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields: "campaign_id,date_start,spend,impressions,clicks,actions,action_values"
    })
  ]);

  const byCampaign = new Map<string, Additive>();
  const byDate = new Map<string, Additive>();
  const totals = emptyMetric(Boolean(config.resultActionType), Boolean(config.revenueActionType));
  for (const row of insights) {
    const metric: Additive = {
      spend: number(row.spend),
      impressions: number(row.impressions),
      clicks: number(row.clicks),
      results: actionValue(row.actions, config.resultActionType),
      revenue: actionValue(row.action_values, config.revenueActionType)
    };
    add(totals, metric);
    const campaignMetric = byCampaign.get(row.campaign_id) ?? emptyMetric(Boolean(config.resultActionType), Boolean(config.revenueActionType));
    add(campaignMetric, metric);
    byCampaign.set(row.campaign_id, campaignMetric);
    const dateMetric = byDate.get(row.date_start) ?? emptyMetric(Boolean(config.resultActionType), Boolean(config.revenueActionType));
    add(dateMetric, metric);
    byDate.set(row.date_start, dateMetric);
  }

  return {
    configured: true,
    account: { id: account.id, name: account.name, currency: account.currency, timezone: account.timezone_name },
    period: { since, until },
    resultActionType: config.resultActionType,
    revenueActionType: config.revenueActionType,
    fetchedAt: new Date().toISOString(),
    totals: completeMetric(totals),
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.effective_status,
      objective: campaign.objective,
      metrics: byCampaign.has(campaign.id) ? completeMetric(byCampaign.get(campaign.id)!) : null
    })),
    daily: [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, metrics]) => ({ date, metrics: completeMetric(metrics) }))
  };
}
