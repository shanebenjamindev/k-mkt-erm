"use client";

import { useEffect, useRef, useState } from "react";
import { driveImageFallbackUrl, driveImagePreviewUrl } from "../../lib/drive-links";

type Props = { src: string; alt: string; className?: string; fallback?: string; cacheKey?: string | number };
const preferredSources = new Map<string, string>();
const previewObjectUrls = new Map<string, string>();
const previewLoads = new Map<string, Promise<string | null>>();

function cachedPreview(url: string) {
  const ready = previewObjectUrls.get(url);
  if (ready) return Promise.resolve(ready);
  const inFlight = previewLoads.get(url);
  if (inFlight) return inFlight;
  const load = fetch(url, { credentials: "same-origin", cache: "force-cache" }).then(async (response) => {
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    const objectUrl = URL.createObjectURL(blob);
    previewObjectUrls.set(url, objectUrl);
    while (previewObjectUrls.size > 6) {
      const oldest = previewObjectUrls.keys().next().value as string | undefined;
      if (!oldest) break;
      URL.revokeObjectURL(previewObjectUrls.get(oldest)!);
      previewObjectUrls.delete(oldest);
    }
    return objectUrl;
  }).catch(() => null).finally(() => previewLoads.delete(url));
  previewLoads.set(url, load);
  return load;
}

export function DriveImage({ src, alt, className, fallback = "Ảnh không khả dụng", cacheKey = 0 }: Props) {
  const primary = driveImagePreviewUrl(src);
  const requestSource = primary.startsWith("/api/drive/preview?") ? `${primary}&v=${encodeURIComponent(String(cacheKey))}` : primary;
  const preferenceKey = `${src}::${cacheKey}`;
  const [source, setSource] = useState(() => previewObjectUrls.get(requestSource) ?? preferredSources.get(preferenceKey) ?? requestSource);
  const [failed, setFailed] = useState(false);
  const activeRef = useRef(true);
  const requestSourceRef = useRef(requestSource);
  requestSourceRef.current = requestSource;
  useEffect(() => {
    activeRef.current = true;
    setSource(previewObjectUrls.get(requestSource) ?? preferredSources.get(preferenceKey) ?? requestSource);
    setFailed(false);
    return () => { activeRef.current = false; };
  }, [requestSource, preferenceKey]);
  if (failed) return <span className={`drive-image-fallback${className ? ` ${className}` : ""}`} role="img" aria-label={alt}>{fallback}</span>;
  return <img className={className} src={source} alt={alt} onLoad={() => {
    if (source === requestSource && requestSource.startsWith("/api/drive/preview?")) {
      void cachedPreview(requestSource).then((objectUrl) => { if (objectUrl && activeRef.current && requestSourceRef.current === requestSource) setSource(objectUrl); });
    }
  }} onError={() => {
    if (source === requestSource) {
      const alternative = driveImageFallbackUrl(src);
      if (alternative !== primary) { preferredSources.set(preferenceKey, alternative); setSource(alternative); return; }
    }
    setFailed(true);
  }}/>;
}
