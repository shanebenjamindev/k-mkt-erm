import { NextRequest, NextResponse } from "next/server";
import { getProjectSettings } from "../../../lib/workspace-repository";
import { driveFileIdFromUrl } from "../../../lib/drive-links";
import { getDriveImagePreview } from "../../../lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp"]);

/** Serves the workspace's single configured logo for the tab, PWA and push UI. */
export async function GET(request: NextRequest) {
  try {
    const settings = await getProjectSettings();
    if (!settings.projectLogoUrl) return NextResponse.redirect(new URL("/icon", request.url));
    const driveId = driveFileIdFromUrl(settings.projectLogoUrl);
    if (driveId) {
      const image = await getDriveImagePreview(driveId);
      if (!allowedImageTypes.has(image.mimeType)) return NextResponse.redirect(new URL("/icon", request.url));
      return new NextResponse(image.data, { headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": `public, max-age=60, stale-while-revalidate=300${request.nextUrl.searchParams.get("v") ? ", no-transform" : ""}`,
        "X-Content-Type-Options": "nosniff"
      } });
    }
    const url = new URL(settings.projectLogoUrl);
    if (url.protocol !== "https:") return NextResponse.redirect(new URL("/icon", request.url));
    return NextResponse.redirect(url, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.redirect(new URL("/icon", request.url));
  }
}
