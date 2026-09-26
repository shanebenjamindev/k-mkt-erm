export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  createdTime: string;
  size?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  parents?: string[];
  kind: "folder" | "video" | "file";
};

type DriveApiItem = Omit<DriveItem, "kind">;
type DriveToken = { access_token: string; expires_in: number };
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const ROOT_FOLDER = "root";
let tokenCache: { token: string; expiresAt: number } | null = null;

function config() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken, rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || ROOT_FOLDER };
}

export function driveStatus() {
  const settings = config();
  return { connected: Boolean(settings), rootFolderId: settings?.rootFolderId ?? ROOT_FOLDER };
}

function googleDocId(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Dán liên kết Google Docs hợp lệ."); }
  if (!/^https:$/.test(url.protocol)) throw new Error("Liên kết tài liệu phải dùng HTTPS.");
  if (url.hostname === "docs.google.com") {
    const match = url.pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }
  if (url.hostname === "drive.google.com") {
    const match = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/);
    const id = match?.[1] ?? url.searchParams.get("id");
    if (id && /^[a-zA-Z0-9_-]{10,}$/.test(id)) return id;
  }
  throw new Error("Chỉ hỗ trợ liên kết tài liệu Google Docs hoặc Drive.");
}

export async function exportGoogleDocHtml(value: string) {
  const id = googleDocId(value);
  const source = new URL(value);
  if (source.hostname === "drive.google.com") {
    const metadataResponse = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType&supportsAllDrives=true`);
    const metadata = await metadataResponse.json() as { name?: string; mimeType?: string };
    if (metadata.mimeType?.startsWith("image/") && metadata.mimeType !== "image/svg+xml") {
      const alt = (metadata.name ?? "Ảnh từ Google Drive").replace(/[<>"&]/g, "");
      return { html: `<p><img src="/api/drive/preview?id=${encodeURIComponent(id)}" alt="${alt}"></p>`, url: value };
    }
    if (metadata.mimeType && metadata.mimeType !== "application/vnd.google-apps.document") {
      throw new Error("Tệp Drive này không phải Google Docs hoặc ảnh được hỗ trợ.");
    }
  }
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=text%2Fhtml`);
  const html = await response.text();
  if (!html || html.length > 1_000_000) throw new Error("Tài liệu trống hoặc vượt quá giới hạn 1 MB.");
  return { html, url: `https://docs.google.com/document/d/${encodeURIComponent(id)}/edit` };
}

export async function getDriveImagePreview(id: string) {
  const metadata = await getDriveImageInfo(id);
  const maxBytes = 20 * 1024 * 1024;
  if (metadata.size && Number(metadata.size) > maxBytes) throw new Error("Ảnh Drive vượt quá giới hạn xem trước 20 MB.");
  const fileResponse = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`);
  const data = await fileResponse.arrayBuffer();
  if (data.byteLength > maxBytes) throw new Error("Ảnh Drive vượt quá giới hạn xem trước 20 MB.");
  return { data, mimeType: metadata.mimeType, name: metadata.name ?? "drive-image" };
}

const SAFE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp"]);

export async function getDriveImageInfo(id: string) {
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(id)) throw new Error("ID ảnh Drive không hợp lệ.");
  const metadataResponse = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size&supportsAllDrives=true`);
  const metadata = await metadataResponse.json() as { id?: string; name?: string; mimeType?: string; size?: string; modifiedTime?: string };
  const mimeType = metadata.mimeType;
  if (!mimeType || !SAFE_IMAGE_TYPES.has(mimeType)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, WebP, GIF, AVIF hoặc BMP trên Google Drive.");
  return { ...metadata, mimeType };
}

function requireConfig() {
  const settings = config();
  if (!settings) throw new Error("Google Drive chưa được kết nối. Hãy cấu hình GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET và GOOGLE_DRIVE_REFRESH_TOKEN.");
  return settings;
}

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  const settings = requireConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, refresh_token: settings.refreshToken, grant_type: "refresh_token" }) });
  const body = await response.json() as DriveToken & { error?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description ?? body.error ?? "Không thể lấy quyền truy cập Google Drive.");
  tokenCache = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return tokenCache.token;
}

async function driveFetch(url: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Google Drive không thể xử lý yêu cầu này.");
  }
  return response;
}

function itemKind(item: DriveApiItem): DriveItem["kind"] {
  if (item.mimeType === FOLDER_MIME_TYPE) return "folder";
  if (item.mimeType.startsWith("video/")) return "video";
  return "file";
}

function toDriveItem(item: DriveApiItem): DriveItem { return { ...item, kind: itemKind(item) }; }
function fields() { return "files(id,name,mimeType,modifiedTime,createdTime,size,webViewLink,thumbnailLink,parents),nextPageToken"; }

export async function listDriveItems(parentId?: string) {
  const settings = requireConfig();
  const folderId = parentId || settings.rootFolderId;
  const query = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`;
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.search = new URLSearchParams({ q: query, fields: fields(), orderBy: "folder,name_natural", pageSize: "100", supportsAllDrives: "true", includeItemsFromAllDrives: "true" }).toString();
  const body = await (await driveFetch(url.toString())).json() as { files?: DriveApiItem[] };
  return { items: (body.files ?? []).map(toDriveItem), folderId, rootFolderId: settings.rootFolderId };
}

export async function listDriveImages(folderId: string) {
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(folderId)) throw new Error("Liên kết thư mục Drive không hợp lệ.");
  const items: DriveApiItem[] = [];
  let pageToken = "";
  let skipped = 0;
  let truncated = false;
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    const parameters = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: "files(id,name,mimeType,modifiedTime,createdTime,size,webViewLink,thumbnailLink,parents),nextPageToken",
      orderBy: "name_natural", pageSize: "100", supportsAllDrives: "true", includeItemsFromAllDrives: "true"
    });
    if (pageToken) parameters.set("pageToken", pageToken);
    url.search = parameters.toString();
    const result = await (await driveFetch(url.toString())).json() as { files?: DriveApiItem[]; nextPageToken?: string };
    for (const file of result.files ?? []) {
      if (!SAFE_IMAGE_TYPES.has(file.mimeType) || (file.size && Number(file.size) > 20 * 1024 * 1024)) { skipped += 1; continue; }
      if (items.length >= 1000) { truncated = true; break; }
      items.push(file);
    }
    if (truncated) break;
    pageToken = result.nextPageToken ?? "";
  } while (pageToken);
  return { items: items.map(toDriveItem), skipped, truncated };
}

export async function createDriveFolder(name: string, parentId?: string) {
  const settings = requireConfig();
  const response = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,createdTime,size,webViewLink,thumbnailLink,parents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), mimeType: FOLDER_MIME_TYPE, parents: [parentId || settings.rootFolderId] }) });
  return toDriveItem(await response.json() as DriveApiItem);
}

export async function updateDriveItem(id: string, input: { name?: string; parentId?: string }) {
  const settings = requireConfig();
  const parameters = new URLSearchParams({ fields: "id,name,mimeType,modifiedTime,createdTime,size,webViewLink,thumbnailLink,parents", supportsAllDrives: "true" });
  if (input.parentId) {
    const previous = await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=parents&supportsAllDrives=true`)).json() as { parents?: string[] };
    parameters.set("addParents", input.parentId || settings.rootFolderId);
    if (previous.parents?.length) parameters.set("removeParents", previous.parents.join(","));
  }
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?${parameters.toString()}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.name ? { name: input.name.trim() } : {}) });
  return toDriveItem(await response.json() as DriveApiItem);
}

export async function trashDriveItem(id: string) {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
}

export async function uploadDriveFile(file: File, parentId?: string, name?: string) {
  const settings = requireConfig();
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name: name?.trim() || file.name, parents: [parentId || settings.rootFolderId] })], { type: "application/json" }));
  form.append("file", file, file.name);
  const response = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,createdTime,size,webViewLink,thumbnailLink,parents&supportsAllDrives=true", { method: "POST", body: form });
  return toDriveItem(await response.json() as DriveApiItem);
}
