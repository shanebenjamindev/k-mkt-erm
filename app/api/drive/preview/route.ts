import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { getDriveImagePreview } from "../../../../lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập để xem ảnh Drive." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const id = request.nextUrl.searchParams.get("id") ?? "";
    const image = await getDriveImagePreview(id);
    const safeName = image.name.replace(/[\r\n"\\]/g, "_");
    return new NextResponse(image.data, {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tải ảnh Drive.";
    const status = /không hợp lệ|chỉ có thể|vượt quá giới hạn/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
