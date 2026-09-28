import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { hasSupabaseBackend, supabaseAdmin } from "./supabase-admin";
import { readWorkspace, writeWorkspace, withWorkspaceTransaction } from "./workspace-store";

export type FacebookCredentials = { token: string; version: string; secret: string };
export type StoredFacebookConnection = { userId: string; encryptedToken: string; facebookName: string; expiresAt: string; connectedAt: string };
export class FacebookConnectionRequired extends Error {}
export const FACEBOOK_STATE_COOKIE = "k_mkt_facebook_state";
export function facebookSettings() {
  const keys = ["META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI", "META_TOKEN_ENCRYPTION_KEY", "META_GRAPH_API_VERSION"] as const;
  const missing = keys.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Cần cấu hình đăng nhập Facebook: ${missing.join(", ")}.`);
  const version = process.env.META_GRAPH_API_VERSION!.trim();
  const appId = process.env.META_APP_ID!.trim();
  const redirect = process.env.META_OAUTH_REDIRECT_URI!.trim();
  const uri = new URL(redirect);
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(appId)) throw new Error("Cấu hình ứng dụng Facebook chưa hợp lệ.");
  if (uri.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && uri.protocol === "http:" && ["localhost", "127.0.0.1"].includes(uri.hostname))) throw new Error("Địa chỉ callback Facebook phải dùng HTTPS.");
  encryptionKey();
  return { version, appId, secret: process.env.META_APP_SECRET!.trim(), redirect };
}
function encryptionKey() {
  const value = process.env.META_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("META_TOKEN_ENCRYPTION_KEY phải là khóa ngẫu nhiên 32 byte ở dạng hex.");
  return Buffer.from(value, "hex");
}
export function encryptFacebookSecret(value: string, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(owner));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
}
export function decryptFacebookSecret(value: string, owner: string) {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Dữ liệu kết nối Facebook không hợp lệ.");
  const [iv, tag, encrypted] = parts.map(part => Buffer.from(part, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(owner)); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8");
}
export function sessionFingerprint(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function makeFacebookState(userId: string, sessionToken: string) {
  const state = randomBytes(32).toString("hex");
  const cookie = encryptFacebookSecret(JSON.stringify({ state, userId, session: sessionFingerprint(sessionToken), createdAt: Date.now() }), "facebook-oauth-state");
  return { state, cookie };
}
export function verifyFacebookState(cookie: string, state: string, userId: string, sessionToken: string) {
  try {
    const data = JSON.parse(decryptFacebookSecret(cookie, "facebook-oauth-state"));
    if (data.userId !== userId || data.session !== sessionFingerprint(sessionToken) || typeof data.createdAt !== "number" || Date.now() - data.createdAt > 600000 || data.createdAt > Date.now() || !/^[a-f0-9]{64}$/.test(state) || typeof data.state !== "string") return false;
    const a = Buffer.from(data.state); const b = Buffer.from(state);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}
async function readConnection(userId: string): Promise<StoredFacebookConnection | null> {
  if (hasSupabaseBackend && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("facebook_connections").select("user_id,encrypted_token,facebook_name,expires_at,connected_at").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("Không thể đọc kết nối Facebook. Kiểm tra migration facebook_connections.");
    return data ? { userId: data.user_id, encryptedToken: data.encrypted_token, facebookName: data.facebook_name, expiresAt: data.expires_at, connectedAt: data.connected_at } : null;
  }
  return (await readWorkspace()).facebookConnections?.find(item => item.userId === userId) ?? null;
}
export async function saveFacebookConnection(userId: string, token: string, name: string, expiresIn: number) {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error("Facebook không trả thời hạn token hợp lệ. Hãy kết nối lại.");
  const connection: StoredFacebookConnection = { userId, encryptedToken: encryptFacebookSecret(token, userId), facebookName: name, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), connectedAt: new Date().toISOString() };
  if (hasSupabaseBackend && supabaseAdmin) {
    const { error } = await supabaseAdmin.from("facebook_connections").upsert({ user_id: userId, encrypted_token: connection.encryptedToken, facebook_name: name, expires_at: connection.expiresAt, connected_at: connection.connectedAt }, { onConflict: "user_id" });
    if (error) throw new Error("Không thể lưu kết nối Facebook. Kiểm tra migration facebook_connections.");
  } else await withWorkspaceTransaction(async () => { const data = await readWorkspace(); data.facebookConnections = [...(data.facebookConnections ?? []).filter(item => item.userId !== userId), connection]; await writeWorkspace(data); });
}
export async function removeFacebookConnection(userId: string) {
  if (hasSupabaseBackend && supabaseAdmin) { const { error } = await supabaseAdmin.from("facebook_connections").delete().eq("user_id", userId); if (error) throw new Error("Không thể ngắt kết nối Facebook."); }
  else await withWorkspaceTransaction(async () => { const data = await readWorkspace(); data.facebookConnections = (data.facebookConnections ?? []).filter(item => item.userId !== userId); await writeWorkspace(data); });
}
export async function facebookConnectionStatus(userId: string) {
  let settingsError: string | null = null;
  try { facebookSettings(); } catch (error) { settingsError = error instanceof Error ? error.message : "Chưa cấu hình Facebook OAuth."; }
  if (settingsError) return { connected: false, configured: false, configurationError: settingsError };
  const connection = await readConnection(userId);
  const expired = !!connection && Date.parse(connection.expiresAt) <= Date.now();
  return { configured: true, connected: !!connection && !expired, expired, facebookName: connection?.facebookName, expiresAt: connection?.expiresAt };
}
export async function facebookCredentials(userId: string): Promise<FacebookCredentials> {
  const settings = facebookSettings();
  const connection = await readConnection(userId);
  if (!connection || Date.parse(connection.expiresAt) <= Date.now()) throw new FacebookConnectionRequired("Đăng nhập Facebook để kết nối tài khoản của bạn.");
  return { token: decryptFacebookSecret(connection.encryptedToken, userId), version: settings.version, secret: settings.secret };
}
export async function facebookGet<T>(credentials: FacebookCredentials, resource: string, query: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${credentials.version}/${resource}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("appsecret_proof", createHmac("sha256", credentials.secret).update(credentials.token).digest("hex"));
  let response: Response;
  try { response = await fetch(url, { headers: { Authorization: `Bearer ${credentials.token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) }); } catch { throw new Error("Không thể kết nối Facebook."); }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error || !body) {
    if (body?.error?.code === 190) throw new FacebookConnectionRequired("Phiên Facebook đã hết hạn hoặc bị thu hồi. Hãy đăng nhập Facebook lại.");
    throw new Error("Facebook từ chối yêu cầu. Kiểm tra quyền được cấp cho kết nối.");
  }
  return body as T;
}
export type FacebookAdAccount = { id: string; name: string; currency: string };
export async function listFacebookAdAccounts(credentials: FacebookCredentials): Promise<FacebookAdAccount[]> {
  const items: FacebookAdAccount[] = []; const visited = new Set<string>(); let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const body: { data: FacebookAdAccount[]; paging?: { next?: string; cursors?: { after?: string } } } = await facebookGet(credentials, "me/adaccounts", { fields: "id,name,currency", limit: "100", ...(after ? { after } : {}) });
    items.push(...body.data);
    if (!body.paging?.next) return items;
    after = body.paging.cursors?.after; if (!after || visited.has(after)) break; visited.add(after);
  }
  throw new Error("Không thể đọc hết danh sách tài khoản quảng cáo.");
}
export async function exchangeFacebookCode(code: string) {
  const config = facebookSettings();
  async function exchange(params: Record<string, string>) {
    const url = new URL(`https://graph.facebook.com/${config.version}/oauth/access_token`);
    Object.entries({ client_id: config.appId, client_secret: config.secret, ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
    let response: Response;
    try { response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) }); } catch { throw new Error("Không thể xác thực Facebook."); }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.access_token || body.error) throw new Error("Facebook chưa cấp token. Kiểm tra cấu hình ứng dụng và địa chỉ callback.");
    return body as { access_token: string; expires_in: number };
  }
  const short = await exchange({ code, redirect_uri: config.redirect });
  return exchange({ grant_type: "fb_exchange_token", fb_exchange_token: short.access_token });
}
