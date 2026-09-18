import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { uploadDriveFile } from "../../../../lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (user.accessRole !== "admin") return NextResponse.json({ error: "Chỉ quản trị viên có thể upload tệp." }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    const parentId = form.get("parentId");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Hãy chọn một tệp để upload." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Tệp cần nhỏ hơn 100 MB." }, { status: 413 });
    const item = await uploadDriveFile(file, typeof parentId === "string" ? parentId : undefined);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể upload lên Google Drive." }, { status: 500 });
  }
}
