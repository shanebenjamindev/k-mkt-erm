import type { BriefImage } from "./types";

function decodeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

/** Older PostgreSQL array columns return each image as a JSON string. */
export function normalizeBriefImages(value: unknown): BriefImage[] {
  const items = decodeJson(value);
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const decoded = decodeJson(item);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return [];
    const image = decoded as Record<string, unknown>;
    if (typeof image.id !== "string" || !image.id) return [];
    const src = typeof image.src === "string" && image.src.trim() ? image.src.trim() : undefined;
    const driveFileId = typeof image.driveFileId === "string" && image.driveFileId ? image.driveFileId : undefined;
    if (!src && !driveFileId) return [];
    return [{
      id: image.id, src, driveFileId,
      ...(image.source === "upload" || image.source === "url" ? { source: image.source } : {}),
      title: typeof image.title === "string" ? image.title : "",
      content: typeof image.content === "string" ? image.content : "",
      createdAt: typeof image.createdAt === "string" ? image.createdAt : ""
    }];
  });
}
