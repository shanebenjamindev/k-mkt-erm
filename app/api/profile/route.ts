import { NextRequest, NextResponse } from "next/server";
import { currentToken, currentUser } from "../../../lib/auth";
import { updateCurrentProfile } from "../../../lib/workspace-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    const body = await request.json() as { name?: unknown; role?: unknown; username?: unknown; avatarUrl?: unknown; newPassword?: unknown; confirmPassword?: unknown };
    if (typeof body.name !== "string" || typeof body.role !== "string" || typeof body.username !== "string") return NextResponse.json({ error: "Thông tin hồ sơ không hợp lệ." }, { status: 400 });
    if (body.avatarUrl !== undefined && typeof body.avatarUrl !== "string") return NextResponse.json({ error: "Avatar không hợp lệ." }, { status: 400 });
    if (body.newPassword !== undefined && typeof body.newPassword !== "string") return NextResponse.json({ error: "Mật khẩu mới không hợp lệ." }, { status: 400 });
    if (body.newPassword && body.newPassword !== body.confirmPassword) return NextResponse.json({ error: "Xác nhận mật khẩu mới chưa khớp." }, { status: 400 });
    const member = await updateCurrentProfile(
      user.id,
      { name: body.name, role: body.role, username: body.username, avatarUrl: body.avatarUrl, newPassword: body.newPassword || undefined },
      await currentToken()
    );
    if (!member) return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể cập nhật hồ sơ." }, { status: 400 });
  }
}
