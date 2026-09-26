import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { saveBriefImage, BRIEF_IMAGE_TYPES } from "../../../../../lib/brief-image-storage";
import { can } from "../../../../../lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (!can(user, "brief.edit")) return NextResponse.json({ error: "Bạn không có quyền chỉnh sửa brief." }, { status: 403 });
    const { taskId } = await context.params;
    if (!taskId || taskId.length > 100) return NextResponse.json({ error: "Brief không hợp lệ." }, { status: 400 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Hãy chọn ảnh để tải lên." }, { status: 400 });
    if (!Object.hasOwn(BRIEF_IMAGE_TYPES, file.type)) return NextResponse.json({ error: "Chỉ hỗ trợ ảnh PNG, JPG, WebP, GIF, AVIF hoặc BMP." }, { status: 415 });
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Mỗi ảnh cần nhỏ hơn 8 MB." }, { status: 413 });
    const stored = await saveBriefImage(file);
    const image = { id: stored.key, src: `/api/brief-images/${encodeURIComponent(stored.key)}`, source: "upload" as const, title: "", content: "", createdAt: new Date().toISOString() };
    return NextResponse.json({ image }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu ảnh brief." }, { status: 500 });
  }
}
