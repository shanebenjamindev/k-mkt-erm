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
      label: typeof image.label === "string" ? image.label.slice(0, 200) : undefined,
      feedback: Array.isArray(image.feedback) ? image.feedback.filter((entry): entry is import("./types").ImageFeedback => {
        if (!entry || typeof entry !== "object") return false;
        const box = entry as Record<string, unknown>;
        return typeof box.id === "string" && typeof box.text === "string" && box.text.length <= 2000 && [box.x, box.y, box.width, box.height].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) && Number(box.x) + Number(box.width) <= 1.00001 && Number(box.y) + Number(box.height) <= 1.00001;
      }).slice(0, 100) : [],
      ...(image.source === "upload" || image.source === "url" ? { source: image.source } : {}),
      title: typeof image.title === "string" ? image.title : "",
      content: typeof image.content === "string" ? image.content : "",
      createdAt: typeof image.createdAt === "string" ? image.createdAt : ""
    }];
  });
}
