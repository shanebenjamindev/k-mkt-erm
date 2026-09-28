import { createHmac } from "node:crypto";
import { FacebookConnectionRequired, type FacebookCredentials } from "./facebook-connection";

export type FacebookPage = { id: string; name: string; category?: string };
type ConnectedPage = FacebookPage & { access_token?: string };
export type MetricStatus = "available" | "empty" | "permission" | "unsupported" | "error";
export type PageMetric = { key: string; label: string; values: { date?: string; value: unknown }[]; status: MetricStatus; unavailable?: string };
export type PagePost = { id: string; message?: string; created_time?: string; permalink_url?: string; reactions?: number; comments?: number; shares?: number; thumbnail?: string; mediaType?: "photo" | "video" | "link" | "text"; metricErrors?: Partial<Record<"reactions" | "comments" | "shares", string>> };
export type PageReport = { page: FacebookPage; followers: number | null; fans: number | null; metrics: PageMetric[]; posts: PagePost[]; postsTruncated: boolean; warnings: string[]; missingPermissions: string[]; fetchedAt: string };
const metrics = [
  ["page_media_view", "Lượt xem nội dung"], ["page_post_engagements", "Tương tác bài viết"],
  ["page_daily_follows", "Lượt theo dõi mới"], ["page_daily_unfollows", "Lượt bỏ theo dõi"],
  ["page_total_actions", "Hành động trên trang"], ["page_video_views", "Lượt xem video"],
  ["page_video_view_time", "Thời gian xem video"], ["page_views_total", "Lượt xem trang"],
  ["page_impressions_unique", "Người tiếp cận"], ["page_fan_adds", "Lượt thích trang mới"],
  ["page_fan_removes", "Lượt bỏ thích trang"], ["page_actions_post_reactions_total", "Cảm xúc theo loại"]
];
class PageApiError extends Error { constructor(message: string, public code?: number) { super(message); } }
async function get<T>(config: FacebookCredentials, resource: string, token: string, query: Record<string, string> = {}): Promise<T> {
  const { version } = config;
  const url = new URL(`https://graph.facebook.com/${version}/${resource}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const secret = config.secret;
  if (secret) url.searchParams.set("appsecret_proof", createHmac("sha256", secret).update(token).digest("hex"));
  let response: Response;
  try { response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) }); }
  catch { throw new PageApiError("Không thể kết nối Facebook. Hãy thử lại."); }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    const code = typeof body?.error?.code === "number" ? body.error.code : undefined;
    if (code === 190) throw new FacebookConnectionRequired("Phiên Facebook hết hạn hoặc bị thu hồi. Hãy đăng nhập Facebook lại.");
    const message = code === 190 ? "Token Facebook không hợp lệ hoặc hết hạn. Cập nhật token trên server." : code === 10 || code === 200 ? "Kết nối thiếu quyền đọc Fanpage. Cần pages_show_list, pages_read_engagement và read_insights cùng quyền truy cập trang." : code === 100 ? "Thông số không được phiên bản API hoặc trang này hỗ trợ." : "Facebook chưa trả được dữ liệu. Hãy thử lại sau.";
    throw new PageApiError(`${message}${code ? ` (Meta #${code})` : ""}`, code);
  }
  if (!body) throw new PageApiError("Facebook trả về dữ liệu không hợp lệ.");
  return body as T;
}
type GraphList<T> = { data: T[]; paging?: { next?: string; cursors?: { after?: string } } };
async function connectedPages(config: FacebookCredentials): Promise<ConnectedPage[]> {
  const { token } = config;
  const pages: ConnectedPage[] = [];
  const visited = new Set<string>();
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const result: GraphList<ConnectedPage> = await get(config, "me/accounts", token, { fields: "id,name,category,access_token", limit: "100", ...(after ? { after } : {}) });
    pages.push(...result.data);
    if (!result.paging?.next) return pages;
    after = result.paging.cursors?.after;
    if (!after || visited.has(after)) break;
    visited.add(after);
  }
  throw new Error("Danh sách Fanpage quá dài hoặc không thể đọc hết các trang.");
}
export async function listFacebookPages(config: FacebookCredentials): Promise<FacebookPage[]> {
  return (await connectedPages(config)).map(({ id, name, category }) => ({ id, name, category }));
}
export async function getFacebookPageReport(id: string, since: string, until: string, config: FacebookCredentials): Promise<PageReport> {
  const page = (await connectedPages(config)).find((item) => item.id === id);
  if (!page) throw new Error("Fanpage không nằm trong danh sách trang của kết nối hiện tại.");
  if (!page.access_token) throw new Error("Kết nối chưa trả về token cho Fanpage. Kiểm tra quyền truy cập trang.");
  const token = page.access_token;
  let granted: Set<string> | null = null;
  try {
    const permissions = await get<{ data: { permission: string; status: string }[] }>(config, "me/permissions", config.token);
    granted = new Set(permissions.data.filter((entry) => entry.status === "granted").map((entry) => entry.permission));
  } catch { /* Some token types cannot enumerate permissions; use the individual API responses. */ }
  const missingPermissions = granted ? ["read_insights", "pages_read_user_content"].filter((permission) => !granted.has(permission)) : [];
  const warnings: string[] = [];
  const start = String(Date.parse(`${since}T00:00:00+07:00`) / 1000);
  const end = String(Date.parse(`${until}T00:00:00+07:00`) / 1000 + 86400);
  const metricResults: PageMetric[] = [];
  // Isolate unsupported metrics so one retired metric never hides the rest of the report.
  for (let offset = 0; offset < metrics.length; offset += 4) {
    metricResults.push(...await Promise.all(metrics.slice(offset, offset + 4).map(async ([key, label]): Promise<PageMetric> => {
      if (missingPermissions.includes("read_insights")) return { key, label, values: [], status: "permission", unavailable: "Token chưa được cấp read_insights để đọc chỉ số trang." };
      try {
        const result = await get<{ data: { values?: PageMetric["values"] }[] }>(config, `${id}/insights`, token, { metric: key, period: "day", since: start, until: end });
        const values = (result.data ?? []).flatMap((item) => (item.values ?? []).map((entry: { value: unknown; end_time?: string; date?: string }) => ({ value: entry.value, date: entry.end_time ?? entry.date })));
        return { key, label, values, status: values.length ? "available" : "empty", unavailable: values.length ? undefined : "API trả danh sách rỗng cho chỉ số này trong kỳ đã chọn. Thử kỳ trước; dữ liệu mới có thể chưa được tổng hợp." };
      } catch (error) {
        if (error instanceof FacebookConnectionRequired) throw error;
        const code = error instanceof PageApiError ? error.code : undefined;
        return { key, label, values: [], status: code === 10 || code === 200 ? "permission" : code === 100 ? "unsupported" : "error", unavailable: error instanceof Error ? error.message : "Không đọc được chỉ số" };
      }
    })));
  }
  async function currentCount(field: string): Promise<number | null> {
    try { const result = await get<Record<string, unknown>>(config, id, token, { fields: field }); return typeof result[field] === "number" ? result[field] as number : null; }
    catch (error) { warnings.push(error instanceof Error ? error.message : `Không đọc được ${field}`); return null; }
  }
  const [followers, fans] = await Promise.all([currentCount("followers_count"), currentCount("fan_count")]);
  const posts: PagePost[] = [];
  let postsTruncated = false;
  try {
    let after: string | undefined;
    const visited = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result: GraphList<PagePost & { full_picture?: string; attachments?: { data?: { media_type?: string; type?: string; media?: { image?: { src?: string } } }[] } }> = await get(config, `${id}/published_posts`, token, { fields: "id,message,created_time,permalink_url,full_picture,attachments{media_type,type,media}", since: start, until: end, limit: "100", ...(after ? { after } : {}) });
      posts.push(...result.data.map((post) => {
        const attachment = post.attachments?.data?.[0];
        const type = `${attachment?.media_type ?? ""} ${attachment?.type ?? ""}`.toLowerCase();
        return { id: post.id, message: post.message, created_time: post.created_time, permalink_url: post.permalink_url, thumbnail: post.full_picture || attachment?.media?.image?.src, mediaType: type.includes("video") || post.permalink_url?.includes("/reel/") ? "video" as const : type.includes("photo") || type.includes("album") ? "photo" as const : type.includes("link") ? "link" as const : "text" as const };
      }));
      if (!result.paging?.next) break;
      after = result.paging.cursors?.after;
      if (!after || visited.has(after) || i === 9) { postsTruncated = true; break; }
      visited.add(after);
    }
  } catch (error) { warnings.push(error instanceof Error ? error.message : "Không tải được bài viết"); }
  // Bound requests for large pages; additional posts still appear with unavailable counts.
  const enriched = posts.slice(0, 50);
  for (let offset = 0; offset < enriched.length; offset += 4) {
    await Promise.all(enriched.slice(offset, offset + 4).map(async (post) => {
      post.metricErrors = {};
      // Read independently: a denied comments/reactions edge must not hide shares.
      for (const field of ["reactions", "comments", "shares"] as const) {
        if (field !== "shares" && missingPermissions.includes("pages_read_user_content")) {
          post.metricErrors[field] = "Cần quyền pages_read_user_content để đọc tương tác của người dùng.";
          continue;
        }
        try {
          const result = await get<Record<string, { summary?: { total_count?: number }; count?: number }>>(config, post.id, token, { fields: field === "shares" ? "shares" : `${field}.limit(0).summary(true)` });
          const value = field === "shares" ? result.shares?.count ?? 0 : result[field]?.summary?.total_count;
          if (typeof value === "number") post[field] = value;
          else post.metricErrors[field] = "Meta không trả số lượng cho trường này.";
        } catch (error) {
          post.metricErrors[field] = error instanceof PageApiError && (error.code === 10 || error.code === 200) ? "Thiếu quyền đọc trường này. Kiểm tra pages_read_user_content và quyền truy cập trang." : error instanceof Error ? error.message : "Không đọc được số liệu";
        }
      }
    }));
  }
  if (posts.length > 50) warnings.push("Số liệu tương tác được tải cho 50 bài đầu tiên để giới hạn thời gian chờ.");
  return { page: { id: page.id, name: page.name, category: page.category }, followers, fans, metrics: metricResults, posts, postsTruncated, warnings: [...new Set(warnings)], missingPermissions, fetchedAt: new Date().toISOString() };
}
