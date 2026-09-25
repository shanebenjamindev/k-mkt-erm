import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { getNotificationFeed, NotificationReminderCooldownError, remindNotification } from "../../../../../lib/workspace-repository";
import { sendPushNotifications } from "../../../../../lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const { id } = await context.params;
    const notification = await remindNotification(user.id, id);
    if (!notification) return NextResponse.json({ error: "Không tìm thấy thông báo." }, { status: 404 });
    // In-app delivery is already committed; a push outage must not invite duplicate retries.
    let sent = 0;
    let warning: string | undefined;
    try { sent = (await sendPushNotifications([notification])).sent; }
    catch { warning = "Đã gửi nhắc nhở trong ứng dụng; thông báo đẩy tạm thời không khả dụng."; }
    return NextResponse.json({ notification, sent, warning, ...await getNotificationFeed(user.id) });
  } catch (error) {
    if (error instanceof NotificationReminderCooldownError) {
      return NextResponse.json({ error: error.message, retryAfter: error.retryAfter }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể gửi lại nhắc nhở." }, { status: 500 });
  }
}
