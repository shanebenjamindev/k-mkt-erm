"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { can } from "../../lib/permissions";
import { useRouter } from "next/navigation";
import { FacebookPagesReport } from "../components/FacebookPagesReport";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { Icon } from "../components/Icon";
import { RequestError, requestJson } from "../../lib/client-request";
import type { FacebookAdAccount } from "../../lib/facebook-connection";
import type { AdsCampaign, AdsMetric, AdsReport } from "../../lib/meta-ads";


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

function AdsReportContent() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<FacebookAdAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState("");
  const [accountsRetry, setAccountsRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setAccountsLoading(true); setAccountsError("");
    requestJson<{ accounts: FacebookAdAccount[] }>("/api/facebook/adaccounts", { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setAccounts(data.accounts); setAccountId(data.accounts[0]?.id ?? ""); } }).catch(error => { if (!controller.signal.aborted) { if (error instanceof RequestError && error.status === 409) window.dispatchEvent(new Event("k-mkt:facebook-reconnect")); if (error instanceof RequestError && error.status === 401) router.replace("/login?next=%2Fads"); setAccountsError(error instanceof Error ? error.message : "Không tải được tài khoản quảng cáo."); } }).finally(() => { if (!controller.signal.aborted) setAccountsLoading(false); });
    return () => controller.abort();
  }, [router, accountsRetry]);
  const [dates, setDates] = useState(initialDates);
  const [report, setReport] = useState<AdsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const data = await requestJson<AdsReport>(`/api/ads?account=${encodeURIComponent(accountId)}&since=${encodeURIComponent(dates.since)}&until=${encodeURIComponent(dates.until)}`, { cache: "no-store", signal });
      if (signal?.aborted) return;
      setReport(data);
    } catch (cause) {
      if (!signal?.aborted) {
        setReport(null);
        if (cause instanceof RequestError && cause.status === 409) window.dispatchEvent(new Event("k-mkt:facebook-reconnect"));
        if (cause instanceof RequestError && cause.status === 401) router.replace("/login?next=%2Fads");
        setError(cause instanceof Error ? cause.message : "Không thể tải Meta Ads.");
      }
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [accountId, dates.since, dates.until, router]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const filtered = useMemo(() => (report?.campaigns ?? []).filter((item) =>
    (status === "all" || item.status === status) && `${item.name} ${item.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ), [report, search, status]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const currency = report?.account.currency ?? "VND";
  const maxSpend = Math.max(1, ...(report?.daily.map((day) => day.metrics.spend) ?? []));

  return <>
    <div className="ads-page">
      <header className="ads-heading"><div><small>MARKETING PERFORMANCE</small><h1>Meta Ads</h1><p>Campaign và hiệu suất quảng cáo của team trên cùng workspace.</p></div>
        <div className="ads-actions"><button type="button" className="ads-secondary" disabled={!report || loading} onClick={() => report && downloadReport(report)}>Xuất CSV</button><button type="button" className="ads-primary" disabled={loading} onClick={() => void load()}><Icon name="refresh" size={16}/> {loading ? "Đang tải…" : "Làm mới"}</button></div>
      </header>
      <div className="ads-period"><label>Tài khoản quảng cáo<select value={accountId} disabled={accountsLoading || !accounts.length} onChange={event => { setReport(null); setAccountId(event.target.value); }}>{!accounts.length && <option value="">Chưa có tài khoản</option>}{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label><label>Từ ngày <input type="date" value={dates.since} max={dates.until} onChange={(event) => setDates((value) => ({ ...value, since: event.target.value }))}/></label><label>Đến ngày <input type="date" value={dates.until} min={dates.since} onChange={(event) => setDates((value) => ({ ...value, until: event.target.value }))}/></label>{report && <span>{report.account.name} · {report.account.currency} · {report.account.timezone}</span>}</div>

      {accountsLoading && <p className="ads-empty" role="status">Đang tải tài khoản quảng cáo của bạn…</p>}
      {accountsError && <div className="ads-alert" role="alert"><p>{accountsError}</p><button onClick={() => setAccountsRetry(value => value + 1)}>Thử lại</button></div>}
      {!accountsLoading && !accountsError && !accounts.length && <p className="ads-empty">Facebook chưa cấp tài khoản quảng cáo nào cho kết nối này. Kiểm tra quyền ads_read và các tài khoản bạn quản lý.</p>}
      {error && <div className="ads-alert" role="alert"><strong>Không thể tải số liệu</strong><p>{error}</p><button type="button" onClick={() => void load()}>Thử lại</button></div>}
      {loading && !report && <div className="ads-empty" role="status">Đang tải số liệu quảng cáo…</div>}

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
  </>;
}

type ConnectionStatus = { connected: boolean; configured: boolean; expired?: boolean; facebookName?: string; expiresAt?: string; configurationError?: string };
export default function AdsClient() {
  const { user, loading: authLoading } = useAuth();
  const [source, setSource] = useState<"pages" | "ads">("pages");
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search); const outcome = params.get("facebook");
    if (outcome) {
      setNotice(outcome === "connected" ? "Đã kết nối Facebook thành công." : outcome === "cancelled" ? "Bạn đã hủy đăng nhập Facebook." : outcome === "invalid_state" ? "Phiên xác thực không hợp lệ hoặc đã hết hạn. Hãy kết nối lại." : "Không thể hoàn tất đăng nhập Facebook. Kiểm tra cấu hình callback và quyền của ứng dụng.");
      router.replace("/ads", { scroll: false });
    }
  }, [router]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setConnection(null);
    requestJson<ConnectionStatus>("/api/facebook/connection", { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setConnection(data); }).catch(cause => { if (!controller.signal.aborted) { if (cause instanceof RequestError && cause.status === 401) router.replace("/login?next=%2Fads"); setError(cause instanceof Error ? cause.message : "Không đọc được kết nối."); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision, router, user?.id]);
  useEffect(() => {
    const reconnect = () => { setConnection(current => current ? { ...current, connected: false, expired: true } : current); };
    window.addEventListener("k-mkt:facebook-reconnect", reconnect);
    return () => window.removeEventListener("k-mkt:facebook-reconnect", reconnect);
  }, []);
  const connect = async () => {
    if (busy) return; setBusy(true); setError("");
    try { const data = await requestJson<{ url: string }>("/api/facebook/oauth/start", { method: "POST" }); const url = new URL(data.url); if (url.protocol !== "https:" || url.hostname !== "www.facebook.com") throw new Error("Địa chỉ đăng nhập Facebook không hợp lệ."); window.location.assign(url.toString()); }
    catch (cause) { if (cause instanceof RequestError && cause.status === 401) router.replace("/login?next=%2Fads"); setError(cause instanceof Error ? cause.message : "Không thể đăng nhập Facebook."); setBusy(false); }
  };
  const disconnect = async () => {
    if (busy) return; setBusy(true); setError("");
    try { await requestJson("/api/facebook/connection", { method: "DELETE" }); setConnection(null); setRevision(value => value + 1); setNotice("Đã ngắt kết nối Facebook khỏi tài khoản K-MKT của bạn."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể ngắt kết nối."); }
    finally { setBusy(false); }
  };
  if (authLoading || !can(user, "ads.read")) return <WorkspaceShell title="Facebook & Quảng cáo"><div className="access-denied"><h1>Không có quyền xem báo cáo</h1><p>Đăng nhập bằng tài khoản được cấp quyền để xem dữ liệu.</p></div></WorkspaceShell>;
  return <WorkspaceShell title="Facebook & Quảng cáo"><div className="ads-page">
    {notice && <p className="fb-connection-notice" role="status">{notice}</p>}
    {error && <div className="ads-alert" role="alert"><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>Thử lại</button></div>}
    {loading ? <p className="ads-empty" role="status">Đang kiểm tra kết nối Facebook của bạn…</p> : connection?.connected ? <div className="fb-connection-bar"><div><strong>Facebook · {connection.facebookName}</strong><small>Kết nối riêng của {user?.name}{connection.expiresAt ? ` · Hết hạn ${new Date(connection.expiresAt).toLocaleDateString("vi-VN")}` : ""}</small></div><button className="ads-secondary" disabled={busy} onClick={() => void connect()}>Cấp lại quyền</button><button className="ads-secondary" disabled={busy} onClick={() => void disconnect()}>Ngắt kết nối</button></div> : connection && <section className="fb-connect-card"><Icon name="users" size={36}/><h1>Đăng nhập với Facebook</h1><p>Kết nối tài khoản Facebook của bạn để chọn Fanpage và tài khoản quảng cáo được phép xem.</p>{connection.expired && <p>Phiên Facebook đã hết hạn hoặc bị thu hồi. Đăng nhập lại để tiếp tục.</p>}<button className="fb-login-button" disabled={busy || !connection.configured} onClick={() => void connect()}>{busy ? "Đang chuyển tới Facebook…" : "Tiếp tục với Facebook"}</button>{!connection.configured && <p className="form-error">{connection.configurationError || "Quản trị viên cần cấu hình ứng dụng Facebook OAuth."}</p>}<small>Token được mã hóa và lưu ở server. Người khác trong workspace không dùng được kết nối của bạn.</small></section>}
    {connection?.connected && !loading && <><div className="facebook-source tabs" aria-label="Nguồn báo cáo"><button className={source === "pages" ? "tab active" : "tab"} aria-pressed={source === "pages"} onClick={() => setSource("pages")}>Fanpage</button><button className={source === "ads" ? "tab active" : "tab"} aria-pressed={source === "ads"} onClick={() => setSource("ads")}>Quảng cáo</button></div>{source === "pages" ? <FacebookPagesReport key={user?.id}/> : <AdsReportContent key={user?.id}/>}</>}
  </div></WorkspaceShell>;
}
