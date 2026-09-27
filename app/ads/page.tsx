"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { Icon } from "../components/Icon";
import { requestJson } from "../../lib/client-request";
import type { AdsCampaign, AdsMetric, AdsReport } from "../../lib/meta-ads";

type Unconfigured = { configured: false; missing: string[] };
type ReportResponse = AdsReport | Unconfigured;

function localIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialDates() {
  const until = new Date();
  const since = new Date(until);
  since.setDate(since.getDate() - 13);
  return { since: localIso(since), until: localIso(until) };
}

function count(value: number | null | undefined) {
  return value === null || value === undefined ? "N/A" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return "N/A";
  try { return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: currency === "VND" ? 0 : 2 }).format(value); }
  catch { return `${count(value)} ${currency}`; }
}

function rate(value: number | null | undefined) {
  return value === null || value === undefined ? "N/A" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value * 100)}%`;
}

function roas(value: number | null | undefined) {
  return value === null || value === undefined ? "N/A" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value)}x`;
}

const statusLabels: Record<string, string> = {
  ACTIVE: "Đang chạy", PAUSED: "Tạm dừng", ARCHIVED: "Lưu trữ", DELETED: "Đã xóa",
  IN_PROCESS: "Đang xử lý", WITH_ISSUES: "Cần kiểm tra", CAMPAIGN_PAUSED: "Tạm dừng",
  ADSET_PAUSED: "Tạm dừng", PENDING_REVIEW: "Chờ duyệt", DISAPPROVED: "Không duyệt"
};

function csvValue(value: string | number | null | undefined) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadReport(report: AdsReport) {
  const rows: Array<Array<string | number | null | undefined>> = [
    ["Account", "Currency", "Timezone", "Since", "Until", "Campaign ID", "Campaign", "Status", "Objective", "Spend", "Impressions", "Clicks", "Results", "Revenue", "CTR", "CPC", "CPM", "CPA", "ROAS", "Result action type", "Revenue action type"],
    ...report.campaigns.map((campaign) => [
      report.account.name, report.account.currency, report.account.timezone, report.period.since, report.period.until,
      campaign.id, campaign.name, campaign.status, campaign.objective, campaign.metrics?.spend ?? null,
      campaign.metrics?.impressions ?? null, campaign.metrics?.clicks ?? null, campaign.metrics?.results ?? null,
      campaign.metrics?.revenue ?? null, campaign.metrics?.ctr ?? null, campaign.metrics?.cpc ?? null,
      campaign.metrics?.cpm ?? null, campaign.metrics?.costPerResult ?? null, campaign.metrics?.roas ?? null,
      report.resultActionType, report.revenueActionType
    ])
  ];
  const blob = new Blob(["\uFEFF", rows.map((row) => row.map(csvValue).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `k-mkt-meta-ads-${report.period.since}-${report.period.until}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MetricRow({ label, metrics, currency }: { label: string; metrics: AdsMetric | null; currency: string }) {
  return <div className="ads-metric-row"><strong>{label}</strong><span>{metrics ? money(metrics.spend, currency) : "N/A"}</span><span>{metrics ? count(metrics.results) : "N/A"}</span><span>{metrics ? money(metrics.costPerResult, currency) : "N/A"}</span></div>;
}

export default function AdsPage() {
  const [dates, setDates] = useState(initialDates);
  const [report, setReport] = useState<AdsReport | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<ReportResponse>(`/api/ads?since=${encodeURIComponent(dates.since)}&until=${encodeURIComponent(dates.until)}`, { cache: "no-store", signal });
      if (signal?.aborted) return;
      if (!data.configured) { setMissing(data.missing); setReport(null); }
      else { setMissing(null); setReport(data); }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải Meta Ads.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [dates.since, dates.until]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const filtered = useMemo(() => (report?.campaigns ?? []).filter((item) =>
    (status === "all" || item.status === status) && `${item.name} ${item.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ), [report, search, status]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const currency = report?.account.currency ?? "VND";
  const maxSpend = Math.max(1, ...(report?.daily.map((day) => day.metrics.spend) ?? []));

  return <WorkspaceShell title="Quảng cáo">
    <div className="ads-page">
      <header className="ads-heading"><div><small>MARKETING PERFORMANCE</small><h1>Meta Ads</h1><p>Campaign và hiệu suất quảng cáo của team trên cùng workspace.</p></div>
        <div className="ads-actions"><button type="button" className="ads-secondary" disabled={!report || loading} onClick={() => report && downloadReport(report)}>Xuất CSV</button><button type="button" className="ads-primary" disabled={loading} onClick={() => void load()}><Icon name="refresh" size={16}/> {loading ? "Đang tải…" : "Làm mới"}</button></div>
      </header>
      <div className="ads-period"><label>Từ ngày <input type="date" value={dates.since} max={dates.until} onChange={(event) => setDates((value) => ({ ...value, since: event.target.value }))}/></label><label>Đến ngày <input type="date" value={dates.until} min={dates.since} onChange={(event) => setDates((value) => ({ ...value, until: event.target.value }))}/></label>{report && <span>{report.account.name} · {report.account.currency} · {report.account.timezone}</span>}</div>

      {error && <div className="ads-alert" role="alert"><strong>Không thể tải số liệu</strong><p>{error}</p><button type="button" onClick={() => void load()}>Thử lại</button></div>}
      {missing && <div className="ads-alert" role="status"><strong>Cần cấu hình Meta Ads</strong><p>Quản trị viên thêm {missing.map((item) => <code key={item}>{item}</code>)} vào biến môi trường server rồi triển khai lại website. Token chỉ lưu trên server.</p></div>}
      {loading && !report && !missing && <div className="ads-empty" role="status">Đang tải số liệu quảng cáo…</div>}

      {report && <>
        <div className="ads-stats">
          <div className="ads-stat"><span>Chi tiêu</span><strong>{money(report.totals.spend, currency)}</strong><small>Trong kỳ đã chọn</small></div>
          <div className="ads-stat"><span>Kết quả</span><strong>{count(report.totals.results)}</strong><small>{report.resultActionType || "Chưa cấu hình loại kết quả"}</small></div>
          <div className="ads-stat"><span>Chi phí / kết quả</span><strong>{money(report.totals.costPerResult, currency)}</strong><small>Cùng loại kết quả đã chọn</small></div>
          <div className="ads-stat"><span>ROAS</span><strong>{roas(report.totals.roas)}</strong><small>{report.revenueActionType || "Chưa cấu hình doanh thu"}</small></div>
        </div>

        <section className="ads-trend" aria-label="Chi tiêu theo ngày"><div className="ads-section-heading"><h2>Chi tiêu theo ngày</h2><span>{report.period.since} – {report.period.until}</span></div>
          {report.daily.length ? <div className="ads-bars">{report.daily.map((day) => <div key={day.date} className="ads-bar-item" title={`${day.date}: ${money(day.metrics.spend, currency)}`}><div className="ads-bar" style={{ height: `${Math.max(3, day.metrics.spend / maxSpend * 100)}%` }}/><span>{day.date.slice(5)}</span></div>)}</div> : <p className="ads-empty">Chưa có chỉ số cho khoảng ngày này.</p>}
        </section>

        <section className={`ads-browser${expanded ? " ads-browser-expanded" : ""}`} aria-label="Campaigns"><div className="ads-list-pane"><div className="ads-section-heading"><div><h2>Campaigns</h2><span>{filtered.length} / {report.campaigns.length} chiến dịch</span></div></div>
          <div className="ads-filters"><input aria-label="Tìm campaign" placeholder="Tìm tên hoặc ID campaign" value={search} onChange={(event) => setSearch(event.target.value)}/><select aria-label="Lọc trạng thái campaign" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tất cả trạng thái</option>{[...new Set(report.campaigns.map((item) => item.status))].map((value) => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select></div>
          <div className="ads-campaign-list">{filtered.map((item) => <button type="button" key={item.id} className={`ads-campaign${selected?.id === item.id ? " ads-campaign-selected" : ""}`} onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id}><span><strong>{item.name}</strong><small>{statusLabels[item.status] || item.status} · {item.id}</small></span><b>{item.metrics ? money(item.metrics.spend, currency) : "Chưa có chi tiêu"}</b></button>)}{!filtered.length && <p className="ads-empty">Không có campaign phù hợp.</p>}</div></div>
          <div className="ads-detail-pane">{selected ? <><div className="ads-detail-top"><div><span className="ads-status">{statusLabels[selected.status] || selected.status}</span><h2>{selected.name}</h2><p>{selected.objective} · ID {selected.id}</p></div><button type="button" className="ads-secondary ads-expand" aria-label={expanded ? "Thu gọn chi tiết" : "Mở rộng chi tiết"} aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Thu gọn" : "Mở rộng"}</button></div>
            <div className="ads-detail-grid"><div><span>Chi tiêu</span><strong>{money(selected.metrics?.spend, currency)}</strong></div><div><span>Kết quả</span><strong>{count(selected.metrics?.results)}</strong></div><div><span>CPA</span><strong>{money(selected.metrics?.costPerResult, currency)}</strong></div><div><span>ROAS</span><strong>{roas(selected.metrics?.roas)}</strong></div></div>
            <h3>Hiệu suất</h3><div className="ads-metric-head"><span>Chỉ số</span><span>Chi tiêu</span><span>Kết quả</span><span>CPA</span></div><MetricRow label="Trong kỳ" metrics={selected.metrics} currency={currency}/>
            <dl className="ads-other-metrics"><div><dt>Hiển thị</dt><dd>{count(selected.metrics?.impressions)}</dd></div><div><dt>Click</dt><dd>{count(selected.metrics?.clicks)}</dd></div><div><dt>CTR</dt><dd>{rate(selected.metrics?.ctr)}</dd></div><div><dt>CPC</dt><dd>{money(selected.metrics?.cpc, currency)}</dd></div><div><dt>CPM</dt><dd>{money(selected.metrics?.cpm, currency)}</dd></div></dl>
            <p className="ads-note">Số liệu được Meta quy gán theo múi giờ của tài khoản. Reach không được cộng từ các bản ghi ngày.</p>
          </> : <p className="ads-empty">Chọn một campaign để xem chi tiết.</p>}</div>
        </section>
        <p className="ads-footnote">Lấy dữ liệu lúc {new Date(report.fetchedAt).toLocaleString("vi-VN")}. CTR, CPC, CPA và ROAS được tính từ các tổng trong kỳ. Kết quả phụ thuộc loại action đã cấu hình.</p>
      </>}
    </div>
  </WorkspaceShell>;
}
