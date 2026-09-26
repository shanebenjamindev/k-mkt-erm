import { driveFileIdFromUrl } from "./drive-links";

const allowed = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "br", "blockquote", "pre", "code", "a", "img", "table", "thead", "tbody", "tr", "td", "th", "hr"]);

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeHref(value: string) {
  const clean = value.replace(/&amp;/g, "&").trim();
  return /^(https?:\/\/|mailto:)/i.test(clean) ? clean : null;
}

function safeImageSrc(value: string) {
  const clean = value.replace(/&amp;/g, "&").trim();
  const driveId = (() => {
    if (clean.startsWith("/api/drive/preview?")) {
      try { return new URL(clean, "https://workspace.invalid").searchParams.get("id"); } catch { return null; }
    }
    return driveFileIdFromUrl(clean);
  })();
  if (driveId && /^[a-zA-Z0-9_-]{10,200}$/.test(driveId)) return `/api/drive/preview?id=${encodeURIComponent(driveId)}`;
  if (clean.startsWith("/api/drive/preview?")) return null;
  try {
    const url = new URL(clean);
    return url.protocol === "https:" && (url.hostname === "lh3.googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com")) ? url.href : null;
  } catch { return null; }
}

export function sanitizeBriefHtml(value: string) {
  const input = value.slice(0, 100_000)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*\/?>/gi, "");
  const chunks = input.split(/(<[^>]*>)/g);
  return chunks.map((chunk) => {
    if (!chunk.startsWith("<")) return chunk;
    const match = chunk.match(/^<\s*(\/?)\s*([a-z0-9]+)\b([^>]*)>$/i);
    if (!match) return "";
    const [, closing, rawName, attrs] = match;
    const name = rawName.toLowerCase();
    if (!allowed.has(name)) return "";
    if (closing) return ["br", "hr"].includes(name) ? "" : `</${name}>`;
    if (name === "br" || name === "hr") return `<${name}>`;
    if (name === "a") {
      const hrefAttr = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = safeHref(hrefAttr?.[1] ?? hrefAttr?.[2] ?? hrefAttr?.[3] ?? "");
      return href ? `<a href="${href.replace(/"/g, "%22")}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    if (name === "img") {
      const srcAttr = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const src = safeImageSrc(srcAttr?.[1] ?? srcAttr?.[2] ?? srcAttr?.[3] ?? "");
      if (!src) return "";
      const altAttr = attrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const alt = (altAttr?.[1] ?? altAttr?.[2] ?? altAttr?.[3] ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<img src="${src.replace(/&/g, "&amp;").replace(/"/g, "%22")}" alt="${alt}" loading="lazy">`;
    }
    return `<${name}>`;
  }).join("");
}

export function briefToHtml(value: string) {
  if (!value) return "";
  if (/<\/?(p|div|h[1-6]|strong|b|em|i|u|s|ul|ol|li|br|blockquote|pre|code|a|img|table|thead|tbody|tr|td|th|hr)\b/i.test(value)) return sanitizeBriefHtml(value);
  return value.split(/\n{2,}/).map((paragraph) => `<p>${escapeText(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
}
