"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RequestError, requestJson } from "../../lib/client-request";
import { Icon } from "./Icon";
import type { FacebookPage, MetricStatus, PagePost, PageReport } from "../../lib/meta-pages";

const format = (value: number | null | undefined) => value === null || value === undefined ? "—" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
const typeLabels = { photo: "Ảnh", video: "Video / Reel", link: "Liên kết", text: "Văn bản" };
const metricLabels: Record<MetricStatus, string> = { available: "Có dữ liệu", empty: "Chưa có bản ghi", permission: "Thiếu quyền", unsupported: "Không hỗ trợ", error: "Lỗi kết nối" };
const iso = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
function period(days: number) { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - days + 1); return { since: iso(start), until: iso(end) }; }
function validPeriod(dates: { since: string; until: string }) { const days = (Date.parse(dates.until) - Date.parse(dates.since)) / 86400000; return Boolean(dates.since && dates.until && Number.isFinite(days) && days >= 0 && days <= 30); }
function facebookUrl(value?: string) { if (!value) return undefined; try { const url = new URL(value); return url.protocol === "https:" && /(^|\.)facebook\.com$/.test(url.hostname) ? value : undefined; } catch { return undefined; } }
function MetricValue({ value }: { value: unknown }) {
  if (typeof value === "number") return <>{format(value)}</>;
  if (value && typeof value === "object" && !Array.isArray(value)) return <div className="fb-breakdown">{Object.entries(value).map(([key, number]) => <span key={key}>{key}: <b>{typeof number === "number" ? format(number) : String(number)}</b></span>)}</div>;
  return <>{value === null || value === undefined ? "—" : String(value)}</>;
}
function Thumbnail({ post }: { post: PagePost }) {
  const [failed, setFailed] = useState(false);
  const src = post.thumbnail?.startsWith("https://") ? post.thumbnail : undefined;
  return <div className="fb-thumbnail">{src && !failed ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <Icon name={post.mediaType === "video" ? "video" : post.mediaType === "photo" ? "image" : "file"} size={28}/>} {post.mediaType === "video" && <span className="fb-play">▶</span>}</div>;
}
function PostCount({ post, field }: { post: PagePost; field: "reactions" | "comments" | "shares" }) {
  const reason = post.metricErrors?.[field] || (post[field] === undefined ? "Bài viết chưa được tải số liệu chi tiết trong báo cáo này." : undefined);
  return <span title={reason} aria-label={reason ? `Chưa đọc được: ${reason}` : undefined} className={reason ? "fb-count-unavailable" : ""}>{format(post[field])}{reason && <small>{reason.includes("quyền") ? "Thiếu quyền" : "Chưa đọc được"}</small>}</span>;
}

export function FacebookPagesReport() {
  const router = useRouter();
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [page, setPage] = useState("");
  const [dates, setDates] = useState(() => period(14));
  const [appliedDates, setAppliedDates] = useState(dates);
  const [report, setReport] = useState<PageReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [listing, setListing] = useState(true);
  const [listError, setListError] = useState("");
  const [retry, setRetry] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState("all");
  const [engagement, setEngagement] = useState("all");
  const [sort, setSort] = useState("newest");
  const [metricFilter, setMetricFilter] = useState("available");
  const [postPage, setPostPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const requestVersion = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setListing(true); setListError("");
    requestJson<{ pages: FacebookPage[] }>("/api/facebook/pages", { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setPages(data.pages);
      let saved = ""; try { saved = localStorage.getItem("k-mkt:facebook:page") ?? ""; } catch {}
      setPage(data.pages.find((item) => item.id === saved)?.id ?? data.pages[0]?.id ?? "");
    }).catch((cause) => { if (!controller.signal.aborted) { if (cause instanceof RequestError && cause.status === 409) window.dispatchEvent(new Event("k-mkt:facebook-reconnect")); if (cause instanceof RequestError && cause.status === 401) router.replace("/login?next=%2Fads"); setListError(cause instanceof Error ? cause.message : "Không tải được Fanpage"); } }).finally(() => { if (!controller.signal.aborted) setListing(false); });
    return () => controller.abort();
  }, [retry, router]);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!page) return;
    const version = ++requestVersion.current;
    setLoading(true); setError(""); setReport(null);
    try {
      const data = await requestJson<PageReport>(`/api/facebook/pages?page=${encodeURIComponent(page)}&since=${appliedDates.since}&until=${appliedDates.until}`, { signal });
      if (!signal.aborted && version === requestVersion.current) setReport(data);
    } catch (cause) { if (!signal.aborted && version === requestVersion.current) { if (cause instanceof RequestError && cause.status === 409) window.dispatchEvent(new Event("k-mkt:facebook-reconnect")); if (cause instanceof RequestError && cause.status === 401) router.replace("/login?next=%2Fads"); setError(cause instanceof Error ? cause.message : "Không tải được số liệu"); } }
    finally { if (!signal.aborted && version === requestVersion.current) setLoading(false); }
  }, [page, appliedDates.since, appliedDates.until, router]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, refresh]);
  useEffect(() => { setPostPage(1); }, [query, mediaType, engagement, sort, pageSize, report]);
  const posts = useMemo(() => (report?.posts ?? []).filter((post) => {
    const matchesText = `${post.message ?? ""} ${post.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const hasCounts = [post.reactions, post.comments, post.shares].some((value) => value !== undefined);
    const hasEngagement = [post.reactions, post.comments, post.shares].some((value) => typeof value === "number" && value > 0);
    return matchesText && (mediaType === "all" || post.mediaType === mediaType) && (engagement === "all" || (engagement === "positive" ? hasEngagement : engagement === "available" ? hasCounts : !hasCounts));
  }).sort((a, b) => {
    if (sort === "newest" || sort === "oldest") return (Date.parse(b.created_time ?? "") - Date.parse(a.created_time ?? "") || 0) * (sort === "oldest" ? -1 : 1);
    const field = sort as "reactions" | "comments" | "shares";
    return (b[field] ?? -1) - (a[field] ?? -1);
  }), [report, query, mediaType, engagement, sort]);
  const pageCount = Math.max(1, Math.ceil(posts.length / pageSize));
  const currentPage = Math.min(postPage, pageCount);
  const availableMetrics = report?.metrics.filter((metric) => metric.status === "available") ?? [];
  const shownMetrics = report?.metrics.filter((metric) => metricFilter === "all" || (metricFilter === "available" ? metric.status === "available" : metric.status !== "available")) ?? [];
  const apply = () => { if (validPeriod(dates)) { setAppliedDates(dates); setRefresh((value) => value + 1); } };
  return <div className="ads-page fb-report">
    <header className="ads-heading"><div><small>FACEBOOK ANALYTICS</small><h1>Hiệu suất Fanpage</h1><p>Theo dõi cộng đồng và nội dung của các trang bạn quản lý.</p></div><button type="button" className="ads-primary" disabled={loading || listing} onClick={() => page ? setRefresh((value) => value + 1) : setRetry((value) => value + 1)}><Icon name="refresh" size={16}/>Làm mới</button></header>
    <section className="fb-toolbar" aria-label="Chọn trang và khoảng thời gian"><label>Fanpage<select value={page} disabled={listing || !pages.length} onChange={(event) => { setPage(event.target.value); try { localStorage.setItem("k-mkt:facebook:page", event.target.value); } catch {} }}>{!pages.length && <option value="">Chưa có Fanpage</option>}{pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Từ ngày<input type="date" value={dates.since} max={dates.until} onChange={(event) => setDates((current) => ({ ...current, since: event.target.value }))}/></label><label>Đến ngày<input type="date" value={dates.until} min={dates.since} onChange={(event) => setDates((current) => ({ ...current, until: event.target.value }))}/></label><button type="button" className="ads-primary" disabled={!page || loading || !validPeriod(dates)} onClick={apply}>Áp dụng</button><div className="fb-presets">{[7, 14, 30].map((days) => <button type="button" key={days} onClick={() => { const value = period(days); setDates(value); setAppliedDates(value); }}>{days} ngày</button>)}</div>{!validPeriod(dates) && <p className="form-error">Chọn khoảng ngày hợp lệ, tối đa 31 ngày.</p>}</section>
    {(listError || error) && <div className="ads-alert" role="alert"><strong>Không thể tải báo cáo</strong><p>{listError || error}</p><button type="button" onClick={() => listError ? setRetry((value) => value + 1) : setRefresh((value) => value + 1)}>Thử lại</button></div>}
    {(listing || loading) && <div className="fb-loading" role="status"><Icon name="refresh" size={24}/><strong>{listing ? "Đang tìm các Fanpage…" : "Đang tổng hợp báo cáo…"}</strong><span>Đọc chỉ số và nội dung từ Facebook</span></div>}
    {!listing && !listError && !pages.length && <p className="ads-empty">Kết nối chưa trả về Fanpage nào. Kiểm tra các trang được cấp cho token và quyền pages_show_list.</p>}
    {report && <>
      {!!report.missingPermissions?.length && <div className="fb-permission" role="status"><Icon name="warning" size={22}/><div><strong>Kết nối đang thiếu quyền đọc một số số liệu</strong><p>{report.missingPermissions.includes("read_insights") && <>Chỉ số trang cần <code>read_insights</code>. </>}{report.missingPermissions.includes("pages_read_user_content") && <>Cảm xúc và bình luận cần <code>pages_read_user_content</code>. </>}Cấp thêm quyền, tạo lại token rồi cập nhật kết nối trên server. Các số liệu đọc được vẫn hiển thị bên dưới.</p></div></div>}
      <div className="ads-stats"><div className="ads-stat"><span>Người theo dõi</span><strong>{format(report.followers)}</strong><small>Hiện tại · {report.page.name}</small></div><div className="ads-stat"><span>Lượt thích trang</span><strong>{format(report.fans)}</strong><small>Tại thời điểm tải báo cáo</small></div><div className="ads-stat"><span>Bài viết đã xuất bản</span><strong>{report.postsTruncated ? "≥ " : ""}{format(report.posts.length)}</strong><small>{appliedDates.since} → {appliedDates.until}</small></div><div className="ads-stat"><span>Chỉ số trang có dữ liệu</span><strong>{availableMetrics.length}<small> / {report.metrics.length} chỉ số đã kiểm tra</small></strong><small>{report.missingPermissions.includes("read_insights") ? "Cần bổ sung quyền read_insights" : "Theo dữ liệu API trả về"}</small></div></div>
      <section className="ads-trend"><div className="ads-section-heading"><div><h2>Chỉ số trang</h2><span>Dữ liệu theo ngày · thời điểm kết thúc kỳ ở UTC</span></div><select aria-label="Lọc trạng thái chỉ số" value={metricFilter} onChange={(event) => setMetricFilter(event.target.value)}><option value="available">Có dữ liệu ({availableMetrics.length})</option><option value="unavailable">Cần kiểm tra ({report.metrics.length - availableMetrics.length})</option><option value="all">Tất cả chỉ số</option></select></div>
      {!shownMetrics.length && <div className="fb-empty"><Icon name="briefs" size={30}/><h3>{report.missingPermissions.includes("read_insights") ? "Chưa thể đọc Insights của trang" : "Không có chỉ số phù hợp bộ lọc"}</h3><p>{report.missingPermissions.includes("read_insights") ? "Token thiếu read_insights. Đây là vấn đề quyền truy cập, không có nghĩa là trang không có tương tác." : "Chọn “Cần kiểm tra” để xem lý do từng chỉ số; thử khoảng ngày trước nếu API trả danh sách rỗng."}</p><button type="button" className="ads-secondary" onClick={() => setMetricFilter("unavailable")}>Xem các chỉ số cần kiểm tra</button></div>}
      <div className="facebook-metrics">{shownMetrics.map((metric) => {
        const numeric = metric.values.length > 0 && metric.values.every((entry) => typeof entry.value === "number");
        const additive = !metric.key.includes("unique") && !metric.key.includes("fans") && !metric.key.includes("followers");
        const total = numeric && additive ? metric.values.reduce((sum, entry) => sum + (entry.value as number), 0) : null;
        return <details key={metric.key} className={`fb-metric fb-metric-${metric.status}`}><summary><span className="fb-metric-label">{metric.label}</span><span className="fb-metric-number">{total !== null ? format(total) : metric.status === "available" ? `${metric.values.length} ngày` : metricLabels[metric.status]}</span><span className="fb-metric-description">{total !== null ? metric.key.includes("view_time") ? "Tổng thời gian (mili giây)" : "Tổng trong kỳ có dữ liệu" : "Bấm để xem chi tiết"}</span></summary>{metric.status !== "available" ? <p>{metric.unavailable || "API không trả bản ghi cho chỉ số trong khoảng ngày đã chọn."}</p> : <table><thead><tr><th>Kết thúc kỳ (UTC)</th><th>Giá trị</th></tr></thead><tbody>{metric.values.map((entry, index) => <tr key={index}><td>{entry.date ? new Date(entry.date).toLocaleString("vi-VN", { timeZone: "UTC" }) : "—"}</td><td><MetricValue value={entry.value}/></td></tr>)}</tbody></table>}</details>;
      })}</div></section>
      <section className="ads-trend fb-content"><div className="ads-section-heading"><div><h2>Thư viện bài viết</h2><span>{posts.length} / {report.posts.length} bài phù hợp · giờ Việt Nam</span></div><span>Tương tác hiện tại của bài viết</span></div>
        <div className="fb-filters"><label className="fb-search"><Icon name="file" size={16}/><input aria-label="Tìm nội dung bài viết" placeholder="Tìm nội dung hoặc ID bài viết…" value={query} onChange={(event) => setQuery(event.target.value)}/></label><select aria-label="Lọc loại nội dung" value={mediaType} onChange={(event) => setMediaType(event.target.value)}><option value="all">Tất cả nội dung</option>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Lọc tương tác" value={engagement} onChange={(event) => setEngagement(event.target.value)}><option value="all">Tất cả tương tác</option><option value="positive">Có tương tác đã đọc</option><option value="available">Có số liệu đã đọc</option><option value="missing">Chưa đọc được số liệu</option></select><select aria-label="Sắp xếp bài viết" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="reactions">Nhiều cảm xúc nhất</option><option value="comments">Nhiều bình luận nhất</option><option value="shares">Nhiều chia sẻ nhất</option></select><button type="button" className="ads-secondary" onClick={() => { setQuery(""); setMediaType("all"); setEngagement("all"); setSort("newest"); }}>Xoá bộ lọc</button></div>
        <div className="fb-post-grid">{posts.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((post) => { const href = facebookUrl(post.permalink_url); return <article className="fb-post-card" key={post.id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Mở bài viết trên Facebook"><Thumbnail post={post}/></a> : <Thumbnail post={post}/>}<div className="fb-post-body"><div className="fb-post-meta"><span>{typeLabels[post.mediaType ?? "text"]}</span><time>{post.created_time ? new Date(post.created_time).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</time></div><p className="fb-post-excerpt">{post.message || "Bài viết không có nội dung văn bản"}</p><details className="fb-post-full"><summary>Xem nội dung đầy đủ</summary><p>{post.message || post.id}</p></details><div className="fb-post-counts"><div><span>Cảm xúc</span><b><PostCount post={post} field="reactions"/></b></div><div><span>Bình luận</span><b><PostCount post={post} field="comments"/></b></div><div><span>Chia sẻ</span><b><PostCount post={post} field="shares"/></b></div></div>{href && <a className="fb-post-link" href={href} target="_blank" rel="noopener noreferrer">Xem trên Facebook <Icon name="external" size={14}/></a>}</div></article>; })}</div>
        {!posts.length && <div className="fb-empty"><h3>Không có bài viết phù hợp</h3><p>{report.posts.length ? "Thử xoá bộ lọc hoặc đổi từ khoá tìm kiếm." : "Không có bài viết được API trả về trong kỳ đã chọn. Thử mở rộng khoảng ngày."}</p></div>}
        <nav className="task-pagination" aria-label="Phân trang bài viết"><label>Hiển thị<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{[6, 12, 24, 48].map((size) => <option value={size} key={size}>{size} bài / trang</option>)}</select></label><span>{posts.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, posts.length)} / {posts.length} bài</span><div className="task-pagination-actions"><button type="button" className="ads-secondary" disabled={currentPage === 1} onClick={() => setPostPage(currentPage - 1)}>← Trước</button><span>{currentPage} / {pageCount}</span><button type="button" className="ads-secondary" disabled={currentPage === pageCount} onClick={() => setPostPage(currentPage + 1)}>Sau →</button></div></nav>
      </section>
      {!!report.warnings.length && <details className="fb-report-warnings"><summary>Lưu ý về phạm vi báo cáo ({report.warnings.length})</summary>{report.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}
      <p className="ads-footnote">Cập nhật {new Date(report.fetchedAt).toLocaleString("vi-VN")} · Dấu “—” là chưa đọc được, số 0 là đã đọc và không có tương tác. Số liệu bài viết là tổng hiện tại, không chỉ tương tác phát sinh trong kỳ.</p>
    </>}
  </div>;
}
