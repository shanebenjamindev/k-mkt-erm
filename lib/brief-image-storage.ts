import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hasSupabaseBackend, supabaseAdmin } from "./supabase-admin";

export const BRIEF_IMAGE_BUCKET = "brief-images";
export const BRIEF_IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp"
} as const;
export type BriefImageMime = keyof typeof BRIEF_IMAGE_TYPES;

const localDirectory = path.join(process.cwd(), ".data", BRIEF_IMAGE_BUCKET);
const imageKeyPattern = /^[a-f0-9-]{36}\.(png|jpg|webp|gif|avif|bmp)$/i;

function detectBriefImageMime(bytes: Uint8Array): BriefImageMime | null {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 8 && bytes[0] === 0x89 && text(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(text(0, 6))) return "image/gif";
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 2 && text(0, 2) === "BM") return "image/bmp";
  if (bytes.length >= 12 && text(4, 8) === "ftyp" && /^(avif|avis)$/.test(text(8, 12))) return "image/avif";
  return null;
}

export async function saveBriefImage(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = detectBriefImageMime(bytes);
  if (!mimeType) throw new Error("Tệp tải lên không chứa dữ liệu ảnh hợp lệ. Hãy chọn lại ảnh PNG, JPG, WebP, GIF, AVIF hoặc BMP.");
  const extension = BRIEF_IMAGE_TYPES[mimeType];
  const key = `${randomUUID()}.${extension}`;
  if (hasSupabaseBackend && supabaseAdmin) {
    const bucket = supabaseAdmin.storage.from(BRIEF_IMAGE_BUCKET);
    const body = new Blob([bytes], { type: mimeType });
    let { error } = await bucket.upload(key, body, { contentType: mimeType, cacheControl: "31536000", upsert: false });
    if (error && /bucket not found|not found/i.test(error.message)) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(BRIEF_IMAGE_BUCKET, {
        public: false,
        fileSizeLimit: 8 * 1024 * 1024,
        allowedMimeTypes: Object.keys(BRIEF_IMAGE_TYPES)
      });
      if (createError && !/already exists|duplicate/i.test(createError.message)) {
        throw new Error(`Không thể khởi tạo kho ảnh brief: ${createError.message}`);
      }
      ({ error } = await bucket.upload(key, body, { contentType: mimeType, cacheControl: "31536000", upsert: false }));
    }
    if (error) throw new Error(/bucket not found/i.test(error.message) ? "Kho ảnh brief chưa được khởi tạo. Hãy áp dụng migration lưu ảnh brief." : `Không thể lưu ảnh brief: ${error.message}`);
  } else {
    await mkdir(localDirectory, { recursive: true });
    await writeFile(path.join(localDirectory, key), bytes);
  }
  return { key, mimeType };
}

export async function readBriefImage(key: string) {
  if (!imageKeyPattern.test(key)) throw new Error("ID ảnh brief không hợp lệ.");
  if (hasSupabaseBackend && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.storage.from(BRIEF_IMAGE_BUCKET).download(key);
    if (error || !data) throw new Error("Không tìm thấy ảnh brief.");
    const bytes = Buffer.from(await data.arrayBuffer());
    const detectedMime = detectBriefImageMime(bytes);
    if (!detectedMime) throw new Error("Dữ liệu ảnh đã lưu bị lỗi. Hãy gỡ ảnh này khỏi brief rồi tải lại tệp gốc.");
    return { data: bytes, mimeType: detectedMime };
  }
  const mimeType = (Object.entries(BRIEF_IMAGE_TYPES).find(([, extension]) => key.toLowerCase().endsWith(`.${extension}`))?.[0] ?? "") as BriefImageMime;
  if (!mimeType) throw new Error("Định dạng ảnh brief không hợp lệ.");
  const data = await readFile(path.join(localDirectory, key));
  const detectedMime = detectBriefImageMime(data);
  if (!detectedMime) throw new Error("Dữ liệu ảnh đã lưu bị lỗi. Hãy gỡ ảnh này khỏi brief rồi tải lại tệp gốc.");
  return { data, mimeType: detectedMime };
}
