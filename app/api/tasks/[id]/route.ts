import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { deleteTask, updateTask, type TaskEffects } from "../../../../lib/workspace-repository";
import { isTaskPatch, TaskValidationError } from "../../../../lib/task-validation";
import { sendPushNotifications } from "../../../../lib/web-push";
import { can } from "../../../../lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (!can(user, "task.update")) return NextResponse.json({ error: "Bạn không có quyền cập nhật công việc." }, { status: 403 });
    const input: unknown = await request.json().catch(() => null);
    if (!isTaskPatch(input)) return NextResponse.json({ error: "Dữ liệu cập nhật không hợp lệ." }, { status: 400 });
    const { id } = await context.params;
    const effects: TaskEffects = { notifications: [] };
    const task = await updateTask(id, input, effects);
    if (!task) return NextResponse.json({ error: "Không tìm thấy công việc." }, { status: 404 });
    try {
      const delivery = await sendPushNotifications(effects.notifications);
      if (effects.notifications.length && (!delivery.sent || delivery.failed)) effects.notificationWarning = delivery.failed ? "Đã tạo thông báo trong app nhưng một số thiết bị không nhận được push." : "Đã tạo thông báo trong app nhưng chưa có thiết bị đăng ký push.";
    }
    catch { effects.notificationWarning = "Đã lưu công việc; thông báo đẩy tạm thời không khả dụng."; }
    return NextResponse.json({ task, warning: effects.notificationWarning });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể cập nhật công việc." }, { status: error instanceof TaskValidationError ? 400 : 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (!can(user, "task.delete")) return NextResponse.json({ error: "Bạn không có quyền xoá công việc." }, { status: 403 });
    const { id } = await context.params;
    const removed = await deleteTask(id);
    if (!removed) return NextResponse.json({ error: "Không tìm thấy công việc." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể xoá công việc." }, { status: 500 });
  }
}
