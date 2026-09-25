import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { getNotificationFeed, scheduleNotification } from "../../../../../lib/workspace-repository";
import { TaskValidationError } from "../../../../../lib/task-validation";
import type { ReminderRepeat } from "../../../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Lịch nhắc không hợp lệ." }, { status: 400 });
    const input = body as { scheduledAt?: unknown; repeat?: unknown };
    if (typeof input.scheduledAt !== "string" || typeof input.repeat !== "string") return NextResponse.json({ error: "Lịch nhắc không hợp lệ." }, { status: 400 });
    const { id } = await context.params;
    const notification = await scheduleNotification(user.id, id, input.scheduledAt, input.repeat as ReminderRepeat);
    if (!notification) return NextResponse.json({ error: "Không tìm thấy thông báo." }, { status: 404 });
    return NextResponse.json({ notification, ...await getNotificationFeed(user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể đặt lịch nhắc." }, { status: error instanceof TaskValidationError ? 400 : 500 });
  }
}
