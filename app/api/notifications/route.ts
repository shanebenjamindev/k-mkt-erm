import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { getNotificationFeed, markAllNotificationsRead, markNotificationRead } from "../../../lib/workspace-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    return NextResponse.json(await getNotificationFeed(user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tải thông báo." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    const input: unknown = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Dữ liệu thông báo không hợp lệ." }, { status: 400 });
    const body = input as { id?: unknown; all?: unknown };
    if (body.all === true && body.id === undefined) {
      await markAllNotificationsRead(user.id);
      return NextResponse.json(await getNotificationFeed(user.id));
    }
    if (typeof body.id !== "string" || !body.id.trim() || body.all !== undefined) return NextResponse.json({ error: "ID thông báo không hợp lệ." }, { status: 400 });
    const notification = await markNotificationRead(user.id, body.id);
    if (!notification) return NextResponse.json({ error: "Không tìm thấy thông báo." }, { status: 404 });
    return NextResponse.json({ notification, ...await getNotificationFeed(user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể cập nhật thông báo." }, { status: 500 });
  }
}
