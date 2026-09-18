import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { listNotifications, markNotificationRead } from "../../../lib/workspace-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    return NextResponse.json({ notifications: await listNotifications(user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tải thông báo." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") return NextResponse.json({ error: "ID thông báo không hợp lệ." }, { status: 400 });
    const notification = await markNotificationRead(user.id, body.id);
    if (!notification) return NextResponse.json({ error: "Không tìm thấy thông báo." }, { status: 404 });
    return NextResponse.json({ notification });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể cập nhật thông báo." }, { status: 500 });
  }
}
