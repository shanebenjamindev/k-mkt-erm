import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { readBriefImage } from "../../../../lib/brief-image-storage";
import { can } from "../../../../lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword || !can(user, "brief.edit")) return NextResponse.json({ error: "Bạn không có quyền xem ảnh brief." }, { status: 403 });
    const { key } = await context.params;
    const image = await readBriefImage(key);
    return new NextResponse(image.data, { headers: { "Content-Type": image.mimeType, "Cache-Control": "private, max-age=3600, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tải ảnh brief.";
    return NextResponse.json({ error: message }, { status: /không tìm thấy/i.test(message) ? 404 : 400 });
  }
}
