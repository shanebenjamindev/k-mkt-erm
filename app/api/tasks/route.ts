import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { createTask, listTasks, type TaskEffects } from "../../../lib/workspace-repository";
import { TASK_STATUSES, WORK_TYPES, type TaskInput } from "../../../lib/types";
import { isTaskInput, TaskValidationError } from "../../../lib/task-validation";
import { sendPushNotifications } from "../../../lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const query = request.nextUrl.searchParams;
    const type = query.get("type");
    const status = query.get("status");
    const owner = query.get("owner")?.toLocaleLowerCase();
    const keyword = query.get("q")?.trim().toLocaleLowerCase();
    let tasks = await listTasks();
    if (type && WORK_TYPES.includes(type as TaskInput["workType"])) tasks = tasks.filter((task) => task.workType === type);
    if (status && TASK_STATUSES.includes(status as TaskInput["status"])) tasks = tasks.filter((task) => task.status === status);
    if (owner) tasks = tasks.filter((task) => task.assigneeIds.includes(owner) || task.owner.toLocaleLowerCase().split(", ").includes(owner));
    if (keyword) tasks = tasks.filter((task) => `${task.code} ${task.title} ${task.owner}`.toLocaleLowerCase().includes(keyword));
    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tải công việc." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const input: unknown = await request.json().catch(() => null);
    if (!isTaskInput(input)) return NextResponse.json({ error: "Dữ liệu công việc không hợp lệ." }, { status: 400 });
    const effects: TaskEffects = { notifications: [] };
    const task = await createTask({ ...input, title: input.title.trim(), owner: input.owner.trim(), format: input.format.trim(), brief: input.brief.trim() }, effects);
    try { await sendPushNotifications(effects.notifications); }
    catch { effects.notificationWarning = "Đã lưu công việc; thông báo đẩy tạm thời không khả dụng."; }
    return NextResponse.json({ task, warning: effects.notificationWarning }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo công việc." }, { status: error instanceof TaskValidationError ? 400 : 500 });
  }
}
