import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { createTask, listNotificationsForTask, listTasks } from "../../../lib/workspace-repository";
import { TASK_STATUSES, WORK_TYPES, type TaskInput } from "../../../lib/types";
import { sendPushNotifications } from "../../../lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isTaskInput(value: unknown): value is TaskInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.title === "string" && item.title.trim().length > 0
    && typeof item.owner === "string" && item.owner.trim().length > 0
    && typeof item.format === "string"
    && typeof item.brief === "string"
    && typeof item.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.startDate)
    && typeof item.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.deadline)
    && item.startDate <= item.deadline
    && typeof item.startTime === "string"
    && WORK_TYPES.includes(item.workType as TaskInput["workType"])
    && TASK_STATUSES.includes(item.status as TaskInput["status"]);
}

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
    if (owner) tasks = tasks.filter((task) => task.owner.toLocaleLowerCase() === owner);
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
    const input = await request.json();
    if (!isTaskInput(input)) return NextResponse.json({ error: "Dữ liệu công việc không hợp lệ." }, { status: 400 });
    const task = await createTask({ ...input, title: input.title.trim(), owner: input.owner.trim(), format: input.format.trim(), brief: input.brief.trim() });
    await sendPushNotifications(await listNotificationsForTask(task.id));
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo công việc." }, { status: 500 });
  }
}
