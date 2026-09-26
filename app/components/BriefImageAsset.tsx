"use client";

import { useEffect, useState } from "react";

type Props = { src: string; alt: string; className?: string; mode?: "thumbnail" | "viewer" };

function detectImageMime(data: ArrayBuffer): string | null {
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 16));
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (String.fromCharCode(...bytes.slice(0, 6)).match(/^GIF8[79]a$/)) return "image/gif";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (String.fromCharCode(...bytes.slice(0, 2)) === "BM") return "image/bmp";
  if (String.fromCharCode(...bytes.slice(4, 12)).startsWith("ftyp") && /^(avif|avis)$/.test(String.fromCharCode(...bytes.slice(8, 12)))) return "image/avif";
  return null;
}

export function BriefImageAsset({ src, alt, className = "", mode = "thumbnail" }: Props) {
  const [objectUrl, setObjectUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let currentObjectUrl = "";
    setObjectUrl("");
    setError("");
    if (!src.trim()) {
      setError("Ảnh thiếu đường dẫn tải. Hãy tải lại danh sách brief.");
      return () => controller.abort();
    }
    const loadImage = async () => {
      let response = await fetch(src, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      // The session endpoint refreshes an expired short-lived cookie. Retry once
      // when the host has redirected this API request to its HTML sign-in page.
      if (response.redirected || contentType.includes("text/html")) {
        const session = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!session.ok) throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để xem ảnh brief.");
        response = await fetch(src, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      }
      return response;
    };
    void loadImage()
      .then(async (response) => {
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error || `Không tải được ảnh (lỗi ${response.status}).`);
        }
        const bytes = await response.arrayBuffer();
        const mimeType = detectImageMime(bytes);
        if (!mimeType) {
          if (contentType.includes("application/json")) {
            const text = new TextDecoder().decode(bytes);
            let result: { error?: string } = {};
            try {
              result = JSON.parse(text) as { error?: string };
            } catch {}
            throw new Error(result.error || "Máy chủ không trả về dữ liệu ảnh hợp lệ.");
          }
          if (contentType.includes("text/html")) throw new Error("Máy chủ trả về trang web thay vì ảnh. Hãy tải lại trang và thử lại.");
          throw new Error("Dữ liệu ảnh đã lưu không hợp lệ. Hãy gỡ ảnh này khỏi brief rồi tải lại tệp gốc.");
        }
        return new Blob([bytes], { type: mimeType });
      })
      .then((blob) => {
        if (!active) return;
        currentObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(currentObjectUrl);
      })
      .catch((cause: unknown) => {
        if (!active || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setError(cause instanceof Error ? cause.message : "Không thể tải ảnh.");
      });
    return () => {
      active = false;
      controller.abort();
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [src]);

  if (error) return <span className={`${mode === "viewer" ? "brief-gallery-viewer-error" : "brief-gallery-image-error"} ${className}`} role="status" title={error}>{error}</span>;
  if (!objectUrl) return <span className={`${mode === "viewer" ? "brief-gallery-viewer-error" : "brief-gallery-image-error"} ${className}`} role="status">Đang tải ảnh…</span>;
  return <img className={className} src={objectUrl} alt={alt}/>;
}
