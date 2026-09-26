const DRIVE_ID_PATTERN = /^[a-zA-Z0-9_-]{10,200}$/;

export function driveFileIdFromUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "drive.google.com") return null;
    const id = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]{10,200})/)?.[1] ?? url.searchParams.get("id");
    return id && DRIVE_ID_PATTERN.test(id) ? id : null;
  } catch { return null; }
}

export function driveFolderIdFromUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "drive.google.com") return null;
    const id = url.pathname.match(/^\/(?:drive\/(?:u\/\d+\/)?|)folders\/([a-zA-Z0-9_-]{10,200})/)?.[1]
      ?? (url.pathname === "/open" ? url.searchParams.get("id") : null);
    return id && DRIVE_ID_PATTERN.test(id) ? id : null;
  } catch { return null; }
}

export function driveImagePreviewUrl(value: string) {
  const id = driveFileIdFromUrl(value);
  return id ? `/api/drive/preview?id=${encodeURIComponent(id)}` : value;
}

/** A browser-session fallback for files shared with the signed-in Google user. */
export function driveImageFallbackUrl(value: string) {
  const id = driveFileIdFromUrl(value);
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600` : value;
}
