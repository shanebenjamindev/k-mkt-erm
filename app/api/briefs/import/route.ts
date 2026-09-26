import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { exportGoogleDocHtml } from "../../../../lib/google-drive";
import { sanitizeBriefHtml } from "../../../../lib/brief-html";
import { can } from "../../../../lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (!can(user, "brief.edit")) return NextResponse.json({ error: "Bạn không có quyền nhập nội dung brief." }, { status: 403 });
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof (body as { url?: unknown }).url !== "string") return NextResponse.json({ error: "Thiếu liên kết Google Docs." }, { status: 400 });
    const { html, url } = await exportGoogleDocHtml((body as { url: string }).url);
    const brief = sanitizeBriefHtml(html);
    if (!brief || brief.length > 100_000) return NextResponse.json({ error: "Nội dung tài liệu rỗng hoặc vượt giới hạn 100 KB sau khi định dạng." }, { status: 413 });
    return NextResponse.json({ brief, url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể đọc tài liệu Google Docs." }, { status: 500 });
  }
}
