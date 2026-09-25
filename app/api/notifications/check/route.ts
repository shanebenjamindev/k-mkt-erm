import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { createScheduledReminders, getNotificationFeed } from "../../../../lib/workspace-repository";
import { sendPushNotifications } from "../../../../lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const due = await createScheduledReminders(new Date(), user.id);
    let warning: string | undefined;
    if (due.length) {
      try { await sendPushNotifications(due); }
      catch { warning = "Đã tạo thông báo trong ứng dụng; push tạm thời không khả dụng."; }
    }
    return NextResponse.json({ ...await getNotificationFeed(user.id), warning }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể kiểm tra lịch nhắc." }, { status: 500 });
  }
}
