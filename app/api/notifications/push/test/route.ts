import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { pushConfiguration, sendPushNotifications } from "../../../../../lib/web-push";
import type { WorkspaceNotification } from "../../../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const config = pushConfiguration();
    if (!config.configured) return NextResponse.json({ error: config.error, cause: "vapid" }, { status: 503 });
    const notification: WorkspaceNotification = { id: randomUUID(), userId: user.id, kind: "task_assigned", title: "Kiểm tra thông báo K-MKT", body: "Nếu bạn thấy thông báo này, iPhone đã nhận push từ server.", eventKey: `push-test:${Date.now()}`, readAt: null, createdAt: new Date().toISOString() };
    const result = await sendPushNotifications([notification]);
    if (!result.subscriptions) return NextResponse.json({ error: "Tài khoản chưa có thiết bị đăng ký nhận push. Hãy bật thông báo trên đúng thiết bị.", cause: "subscription" }, { status: 409 });
    if (result.failed || !result.sent) {
      const error = result.reasons.some((code) => code === 404 || code === 410)
        ? "Đăng ký push trên iPhone đã hết hạn. Hãy tắt rồi bật lại thông báo."
        : result.reasons.some((code) => code === 401 || code === 403)
          ? "Server từ chối khóa push. Quản trị viên cần kiểm tra cặp khóa VAPID."
          : "Server không gửi được tới thiết bị. Hãy kiểm tra kết nối rồi thử lại.";
      return NextResponse.json({ error, cause: "delivery", statusCodes: result.reasons }, { status: 502 });
    }
    return NextResponse.json({ sent: result.sent, message: "Đã gửi thông báo thử tới thiết bị đã đăng ký." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể gửi thông báo thử." }, { status: 500 });
  }
}
