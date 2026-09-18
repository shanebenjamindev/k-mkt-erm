import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { deleteTask, listNotificationsForTask, updateTask } from "../../../../lib/workspace-repository";
import { TASK_STATUSES, WORK_TYPES, type TaskInput } from "../../../../lib/types";
import { sendPushNotifications } from "../../../../lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validPatch(value: unknown): value is Partial<TaskInput> {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (item.title !== undefined && (typeof item.title !== "string" || !item.title.trim())) return false;
  if (item.owner !== undefined && (typeof item.owner !== "string" || !item.owner.trim())) return false;
  if (item.format !== undefined && typeof item.format !== "string") return false;
  if (item.brief !== undefined && typeof item.brief !== "string") return false;
  if (item.startDate !== undefined && (typeof item.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.startDate))) return false;
  if (item.deadline !== undefined && (typeof item.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.deadline))) return false;
  if (item.startTime !== undefined && typeof item.startTime !== "string") return false;
  if (item.endTime !== undefined && typeof item.endTime !== "string") return false;
  if (item.workType !== undefined && !WORK_TYPES.includes(item.workType as TaskInput["workType"])) return false;
  if (item.status !== undefined && !TASK_STATUSES.includes(item.status as TaskInput["status"])) return false;
  return true;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const input = await request.json();
    if (!validPatch(input)) return NextResponse.json({ error: "Dữ liệu cập nhật không hợp lệ." }, { status: 400 });
    const { id } = await context.params;
    const task = await updateTask(id, input);
    if (!task) return NextResponse.json({ error: "Không tìm thấy công việc." }, { status: 404 });
    await sendPushNotifications(await listNotificationsForTask(task.id));
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể cập nhật công việc." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const { id } = await context.params;
    const removed = await deleteTask(id);
    if (!removed) return NextResponse.json({ error: "Không tìm thấy công việc." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể xoá công việc." }, { status: 500 });
  }
}
