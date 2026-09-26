import { randomUUID } from "node:crypto";
import { normalizeBriefImages } from "./brief-images";
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from "./project-settings";
import { dueRelativeOffsets, nextScheduledAt, taskReminderDue, vietnamNow } from "./reminder-schedule";
import { isCalendarDate, isClockTime, TaskValidationError } from "./task-validation";
import { hashPassword } from "./password";
import { NOTIFICATION_REMINDER_COOLDOWN_MS, reminderRetryAfter, type NotificationFeed } from "./notification-state";
import { createSupabaseAuthClient, hasSupabaseBackend, supabaseAdmin } from "./supabase-admin";
import { readWorkspace, writeWorkspace, withWorkspaceTransaction, type StoredMember } from "./workspace-store";
import {
  initialsFor,
  type AccessRole,
  type NotificationKind,
  type PushSubscriptionRecord,
  type Task,
  type TaskInput,
  type TaskStatus,
  type TeamMember,
  type TeamMemberInput,
  type WorkType,
  type WorkspaceNotification
} from "./types";

const UNASSIGNED = "Chưa phân công";
const cleanUsername = (value: string) => value.trim().toLocaleLowerCase();
const cleanAvatar = (value?: string) => value?.startsWith("data:image/") ? value : undefined;
const usernameEmail = (username: string) => `${cleanUsername(username)}@accounts.k-mkt.local`;
const publicMember = ({ passwordHash: _passwordHash, ...member }: StoredMember): TeamMember => member;

type TaskRow = { id: string; title: string; owner_name: string; assignee_ids?: string[]; linked_brief_ids?: string[]; work_type: WorkType; status: TaskStatus; start_date: string | null; deadline: string | null; start_time: string; end_time: string; reminder_date?: string | null; reminder_time?: string | null; reminder_repeat?: Task["reminderRepeat"]; reminder_offsets?: number[]; format: string; brief: string; brief_url?: string | null; brief_final_url?: string | null; brief_images?: Task["briefImages"]; created_at: string; updated_at: string };
type MemberRow = { id: string; name: string; role: string; work_type: WorkType; username: string; access_role: AccessRole; avatar_url: string | null; initials: string; must_change_password: boolean; created_at: string };
type NotificationRow = { id: string; user_id: string; task_id: string | null; kind: NotificationKind; title: string; body: string; event_key: string; read_at: string | null; reminded_at?: string | null; scheduled_at?: string | null; scheduled_repeat?: Task["reminderRepeat"]; created_at: string };
type PushRow = { id: string; user_id: string; endpoint: string; keys: { p256dh: string; auth: string }; created_at: string };

function taskAssigneeIds(task: Pick<Task, "owner" | "assigneeIds">, members: TeamMember[]) {
  if (Array.isArray(task.assigneeIds)) return task.assigneeIds.filter((id) => members.some((member) => member.id === id));
  const legacy = members.find((member) => member.name === task.owner);
  return legacy ? [legacy.id] : [];
}

function assigneeNames(ids: string[], members: TeamMember[]) {
  return ids.map((id) => members.find((member) => member.id === id)?.name).filter((name): name is string => Boolean(name)).join(", ") || UNASSIGNED;
}

function syncLocalAssignments(data: Awaited<ReturnType<typeof readWorkspace>>) {
  const members = data.members.map(publicMember);
  data.tasks = data.tasks.map((task) => {
    const assigneeIds = taskAssigneeIds(task, members);
    return { ...task, assigneeIds, owner: assigneeNames(assigneeIds, members) };
  });
}

const toTask = (row: TaskRow, members: TeamMember[] = []): Task => ({
  id: row.id, title: row.title,
  assigneeIds: row.assignee_ids?.filter((id) => members.some((member) => member.id === id)) ?? members.filter((member) => member.name === row.owner_name).map((member) => member.id).slice(0, 1),
  owner: row.assignee_ids ? assigneeNames(row.assignee_ids, members) : row.owner_name || UNASSIGNED, workType: row.work_type,
  status: row.status, startDate: row.start_date ?? row.deadline, deadline: row.deadline, startTime: row.start_time.slice(0, 5), endTime: row.end_time?.slice(0, 5) ?? "11:00", reminderDate: row.reminder_date ?? null, reminderTime: row.reminder_time?.slice(0, 5) ?? null, reminderRepeat: row.reminder_repeat ?? "none", reminderOffsets: row.reminder_offsets ?? [], format: row.format,
  brief: row.brief, briefUrl: row.brief_url ?? null, briefFinalUrl: row.brief_final_url ?? null, briefImages: normalizeBriefImages(row.brief_images), linkedBriefIds: row.linked_brief_ids ?? [], createdAt: row.created_at, updatedAt: row.updated_at
});
const toMember = (row: MemberRow): TeamMember => ({
  id: row.id, name: row.name, role: row.role, workType: row.work_type, username: row.username,
  accessRole: row.access_role, avatarUrl: row.avatar_url ?? undefined, initials: row.initials,
  mustChangePassword: row.must_change_password, createdAt: row.created_at
});
const toNotification = (row: NotificationRow): WorkspaceNotification => ({
  id: row.id, userId: row.user_id, taskId: row.task_id ?? undefined, kind: row.kind, title: row.title,
  body: row.body, eventKey: row.event_key, readAt: row.read_at, remindedAt: row.reminded_at ?? null, scheduledAt: row.scheduled_at ?? null, scheduledRepeat: row.scheduled_repeat ?? "none", createdAt: row.created_at
});
const toPushSubscription = (row: PushRow): PushSubscriptionRecord => ({
  id: row.id, userId: row.user_id, endpoint: row.endpoint, keys: row.keys, createdAt: row.created_at
});

function isRemote() {
  return hasSupabaseBackend && Boolean(supabaseAdmin);
}

function database() {
  if (!isRemote() || !supabaseAdmin) throw new Error("Supabase backend chưa được cấu hình đầy đủ.");
  return supabaseAdmin;
}

function fail(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message ? `${fallback}: ${error.message}` : fallback);
}

function validTime(value: string) {
  if (!isClockTime(value)) throw new TaskValidationError("Giờ làm việc không hợp lệ.");
  return value;
}

function resolveAssignment(input: TaskInput, members: TeamMember[]) {
  const ids = input.assigneeIds ?? members.filter((member) => member.name === input.owner).map((member) => member.id).slice(0, 1);
  if (ids.some((id) => !members.some((member) => member.id === id))) throw new Error("Người phụ trách không hợp lệ. Vui lòng tải lại danh sách nhân viên.");
  return { ...input, assigneeIds: ids, owner: assigneeNames(ids, members), startTime: validTime(input.startTime) };
}

function normalizeSchedule(input: TaskInput, allowUnscheduled = false): TaskInput {
  const startDate = input.startDate || input.deadline;
  const deadline = input.deadline || startDate;
  const startTime = validTime(input.startTime);
  const endTime = validTime(input.endTime);
  if (endTime <= startTime) throw new TaskValidationError("Giờ kết thúc phải sau giờ bắt đầu.");
  // Older tasks can be unscheduled; changing their status must remain possible.
  if (allowUnscheduled && !startDate && !deadline) return { ...input, startDate: null, deadline: null, startTime, endTime };
  if (!isCalendarDate(startDate) || !isCalendarDate(deadline)) throw new TaskValidationError("Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.");
  if (startDate > deadline) throw new TaskValidationError("Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.");
  if (Boolean(input.reminderDate) !== Boolean(input.reminderTime)) throw new TaskValidationError("Vui lòng chọn cả ngày và giờ nhắc.");
  if (input.reminderDate && input.reminderTime && (input.reminderDate > deadline || !isCalendarDate(input.reminderDate) || !isClockTime(input.reminderTime))) throw new TaskValidationError("Lịch nhắc không hợp lệ hoặc sau hạn công việc.");
  return { ...input, startDate, deadline, startTime, endTime };
}

function validateMemberInput(input: TeamMemberInput) {
  const name = input.name.trim();
  const role = input.role.trim();
  const username = cleanUsername(input.username);
  if (!name || !role || !username) throw new Error("Họ tên, vai trò và username là bắt buộc.");
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw new Error("Username chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");
  return { name, role, username };
}

async function findRemoteMember(id: string) {
  const { data, error } = await database().from("team_members").select("*").eq("id", id).maybeSingle();
  if (error) fail(error, "Không thể đọc thành viên");
  return data ? toMember(data as MemberRow) : null;
}

async function addRemoteNotification(notification: Omit<WorkspaceNotification, "id" | "createdAt" | "readAt">) {
  const { data, error } = await database().from("workspace_notifications").upsert({
    user_id: notification.userId, task_id: notification.taskId ?? null, kind: notification.kind,
    title: notification.title, body: notification.body, event_key: notification.eventKey
  }, { onConflict: "user_id,event_key", ignoreDuplicates: true }).select().maybeSingle();
  if (error) fail(error, "Không thể tạo thông báo");
  return data ? toNotification(data as NotificationRow) : null;
}

function addLocalNotification(data: Awaited<ReturnType<typeof readWorkspace>>, notification: Omit<WorkspaceNotification, "id" | "createdAt" | "readAt">) {
  const existing = data.notifications.find((item) => item.userId === notification.userId && item.eventKey === notification.eventKey);
  if (existing) return null;
  const created: WorkspaceNotification = { ...notification, id: randomUUID(), readAt: null, createdAt: new Date().toISOString() };
  data.notifications.unshift(created);
  // Retention must never silently delete unread messages or another user's feed.
  let readCount = 0;
  data.notifications = data.notifications.filter((item) => item.userId !== notification.userId || !item.readAt || ++readCount <= 500);
  return created;
}

export type TaskEffects = { notifications: WorkspaceNotification[]; notificationWarning?: string };

async function recordTaskAssignment(task: Task, previousIds: string[], localData: Awaited<ReturnType<typeof readWorkspace>> | undefined, effects?: TaskEffects) {
  try {
    const settings = localData?.settings ?? await getProjectSettings();
    if (!settings.notificationEvents.task_assigned) return;
    for (const userId of task.assigneeIds.filter((id) => !previousIds.includes(id))) {
      const payload = {
        userId, taskId: task.id, kind: "task_assigned" as const, title: "Bạn có công việc mới",
        body: `${task.title}${task.deadline ? ` · Hạn ${task.deadline}` : ""}`,
        eventKey: `assigned:${task.id}:${userId}:${task.updatedAt}`
      };
      const notification = localData ? addLocalNotification(localData, payload) : await addRemoteNotification(payload);
      if (notification) effects?.notifications.push(notification);
    }
  } catch {
    // The task is already durable in Supabase. Do not invite a duplicate retry.
    if (effects) effects.notificationWarning = "Đã lưu công việc nhưng chưa thể gửi thông báo phân công.";
  }
}

export async function listTasks(): Promise<Task[]> {
  if (isRemote()) {
    const [result, members] = await Promise.all([
      database().from("tasks").select("*").order("deadline", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
      listMembers()
    ]);
    const { data, error } = result;
    if (error) fail(error, "Không thể tải công việc");
    return (data as TaskRow[]).map((row) => toTask(row, members));
  }
  return [...(await readWorkspace()).tasks].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function createTask(input: TaskInput, effects?: TaskEffects): Promise<Task> {
  if (isRemote()) {
    const members = await listMembers();
    const clean = normalizeSchedule(resolveAssignment(input, members));
    if (!clean.title.trim()) throw new Error("Tên công việc là bắt buộc.");
    const existingTaskIds = new Set((await listTasks()).map((task) => task.id));
    const linkedBriefIds = (clean.linkedBriefIds ?? []).filter((id) => existingTaskIds.has(id));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await database().from("tasks").insert({
        title: clean.title.trim(), owner_name: clean.owner, assignee_ids: clean.assigneeIds,
        work_type: clean.workType, status: clean.status, start_date: clean.startDate || null, deadline: clean.deadline || null,
        reminder_date: clean.reminderDate ?? null, reminder_time: clean.reminderTime ?? null, reminder_repeat: clean.reminderRepeat ?? "none", reminder_offsets: clean.reminderOffsets ?? [],
        start_time: clean.startTime, end_time: clean.endTime, format: clean.format.trim() || "Chưa xác định", brief: clean.brief.trim(), brief_url: clean.briefUrl ?? null, brief_final_url: clean.briefFinalUrl ?? null, brief_images: clean.briefImages ?? [], linked_brief_ids: linkedBriefIds
      }).select().single();
      if (error?.code === "23505") continue;
      if (error || !data) fail(error, "Không thể tạo công việc");
      const task = toTask(data as TaskRow, members);
      await recordTaskAssignment(task, [], undefined, effects);
      return task;
    }
    throw new Error("Có nhiều công việc được tạo cùng lúc. Vui lòng thử lại.");
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const clean = normalizeSchedule(resolveAssignment(input, data.members.map(publicMember)));
    if (!clean.title.trim()) throw new Error("Tên công việc là bắt buộc.");
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(), ...clean, assigneeIds: clean.assigneeIds ?? [], title: clean.title.trim(), deadline: clean.deadline || null,
      reminderDate: clean.reminderDate ?? null, reminderTime: clean.reminderTime ?? null, reminderRepeat: clean.reminderRepeat ?? "none", reminderOffsets: clean.reminderOffsets ?? [],
      format: clean.format.trim() || "Chưa xác định", brief: clean.brief.trim(), briefUrl: clean.briefUrl ?? null, briefFinalUrl: clean.briefFinalUrl ?? null, briefImages: clean.briefImages ?? [], linkedBriefIds: (clean.linkedBriefIds ?? []).filter((linkedId) => data.tasks.some((item) => item.id === linkedId)), createdAt: now, updatedAt: now
    };
    data.tasks.push(task);
    await recordTaskAssignment(task, [], data, effects);
    await writeWorkspace(data);
    return task;
  });
}

export async function updateTask(id: string, input: Partial<TaskInput>, effects?: TaskEffects): Promise<Task | null> {
  if (isRemote()) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: existing, error: loadError } = await database().from("tasks").select("*").eq("id", id).maybeSingle();
      if (loadError) fail(loadError, "Không thể đọc công việc");
      if (!existing) return null;
      const members = await listMembers();
      const previous = toTask(existing as TaskRow, members);
      const existingTaskIds = input.linkedBriefIds === undefined ? null : new Set((await listTasks()).map((task) => task.id));
      const linkedBriefIds = input.linkedBriefIds === undefined ? previous.linkedBriefIds : [...new Set(input.linkedBriefIds)].filter((linkedId) => linkedId !== id && existingTaskIds!.has(linkedId));
      const merged: TaskInput = {
        title: input.title ?? previous.title, owner: input.owner ?? previous.owner, workType: input.workType ?? previous.workType,
        assigneeIds: input.assigneeIds ?? (input.owner !== undefined ? undefined : previous.assigneeIds),
        reminderDate: input.reminderDate !== undefined ? input.reminderDate : previous.reminderDate,
        reminderTime: input.reminderTime !== undefined ? input.reminderTime : previous.reminderTime,
        reminderRepeat: input.reminderRepeat ?? previous.reminderRepeat,
        reminderOffsets: input.reminderOffsets ?? previous.reminderOffsets,
        status: input.status ?? previous.status, deadline: input.deadline === "" ? null : input.deadline ?? previous.deadline,
        startDate: input.startDate === "" ? null : input.startDate ?? previous.startDate ?? previous.deadline,
        startTime: input.startTime ?? previous.startTime, endTime: input.endTime ?? previous.endTime, format: input.format ?? previous.format, brief: input.brief ?? previous.brief, briefUrl: input.briefUrl !== undefined ? input.briefUrl : previous.briefUrl, briefFinalUrl: input.briefFinalUrl !== undefined ? input.briefFinalUrl : previous.briefFinalUrl, briefImages: input.briefImages ?? previous.briefImages, linkedBriefIds
      };
      const clean = normalizeSchedule(resolveAssignment(merged, members), !previous.startDate && !previous.deadline);
      if (!clean.title.trim()) throw new Error("Tên công việc là bắt buộc.");
      const { data, error } = await database().from("tasks").update({
        title: clean.title.trim(), owner_name: clean.owner, assignee_ids: clean.assigneeIds, work_type: clean.workType, status: clean.status,
        start_date: clean.startDate || null, deadline: clean.deadline || null, start_time: clean.startTime, end_time: clean.endTime,
        reminder_date: clean.reminderDate ?? null, reminder_time: clean.reminderTime ?? null, reminder_repeat: clean.reminderRepeat ?? "none", reminder_offsets: clean.reminderOffsets ?? [], format: clean.format.trim() || "Chưa xác định", brief: clean.brief.trim(), brief_url: clean.briefUrl ?? null, brief_final_url: clean.briefFinalUrl ?? null, brief_images: clean.briefImages ?? [], linked_brief_ids: clean.linkedBriefIds ?? []
      }).eq("id", id).eq("updated_at", previous.updatedAt).select().maybeSingle();
      if (error) fail(error, "Không thể cập nhật công việc");
      if (!data) continue;
      const task = toTask(data as TaskRow, members);
      await recordTaskAssignment(task, previous.assigneeIds, undefined, effects);
      return task;
    }
    throw new Error("Công việc đang được cập nhật bởi người khác. Vui lòng thử lại.");
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const index = data.tasks.findIndex((task) => task.id === id);
    if (index < 0) return null;
    const previous = data.tasks[index];
    const merged: TaskInput = {
      title: input.title ?? previous.title, owner: input.owner ?? previous.owner, workType: input.workType ?? previous.workType,
      assigneeIds: input.assigneeIds ?? (input.owner !== undefined ? undefined : taskAssigneeIds(previous, data.members.map(publicMember))),
      reminderDate: input.reminderDate !== undefined ? input.reminderDate : previous.reminderDate,
      reminderTime: input.reminderTime !== undefined ? input.reminderTime : previous.reminderTime,
      reminderRepeat: input.reminderRepeat ?? previous.reminderRepeat,
      reminderOffsets: input.reminderOffsets ?? previous.reminderOffsets,
      status: input.status ?? previous.status, deadline: input.deadline === "" ? null : input.deadline ?? previous.deadline,
      startDate: input.startDate === "" ? null : input.startDate ?? previous.startDate ?? previous.deadline,
      startTime: input.startTime ?? previous.startTime, endTime: input.endTime ?? previous.endTime, format: input.format ?? previous.format, brief: input.brief ?? previous.brief, briefUrl: input.briefUrl !== undefined ? input.briefUrl : previous.briefUrl, briefFinalUrl: input.briefFinalUrl !== undefined ? input.briefFinalUrl : previous.briefFinalUrl, briefImages: input.briefImages ?? previous.briefImages, linkedBriefIds: input.linkedBriefIds === undefined ? previous.linkedBriefIds : input.linkedBriefIds.filter((linkedId) => linkedId !== id && data.tasks.some((item) => item.id === linkedId))
    };
    const clean = normalizeSchedule(resolveAssignment(merged, data.members.map(publicMember)), !previous.startDate && !previous.deadline);
    if (!clean.title.trim()) throw new Error("Tên công việc là bắt buộc.");
    const updated: Task = { ...previous, ...clean, assigneeIds: clean.assigneeIds ?? [], linkedBriefIds: clean.linkedBriefIds ?? previous.linkedBriefIds ?? [], title: clean.title.trim(), format: clean.format.trim() || "Chưa xác định", brief: clean.brief.trim(), briefUrl: clean.briefUrl ?? null, briefFinalUrl: clean.briefFinalUrl ?? null, briefImages: clean.briefImages ?? previous.briefImages, updatedAt: new Date().toISOString() };
    data.tasks[index] = updated;
    await recordTaskAssignment(updated, taskAssigneeIds(previous, data.members.map(publicMember)), data, effects);
    await writeWorkspace(data);
    return updated;
  });
}

export async function deleteTask(id: string) {
  if (isRemote()) {
    const { error, count } = await database().from("tasks").delete({ count: "exact" }).eq("id", id);
    if (error) fail(error, "Không thể xoá công việc");
    return (count ?? 0) > 0;
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const length = data.tasks.length;
    data.tasks = data.tasks.filter((task) => task.id !== id);
    data.notifications = data.notifications.filter((item) => item.taskId !== id);
    if (data.tasks.length === length) return false;
    await writeWorkspace(data);
    return true;
  });
}

export async function listMembers(): Promise<TeamMember[]> {
  if (isRemote()) {
    const { data, error } = await database().from("team_members").select("*").order("name", { ascending: true });
    if (error) fail(error, "Không thể tải thành viên");
    return (data as MemberRow[]).map(toMember);
  }
  return (await readWorkspace()).members.map(publicMember).sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export async function createMember(input: TeamMemberInput): Promise<TeamMember> {
  const { name, role, username } = validateMemberInput(input);
  if (!input.password || input.password.length < 8) throw new Error("Mật khẩu khởi tạo phải có ít nhất 8 ký tự.");
  const initialPassword = input.password;
  if (isRemote()) {
    const { data: existing, error: existingError } = await database().from("team_members").select("id").eq("username", username).maybeSingle();
    if (existingError) fail(existingError, "Không thể kiểm tra username");
    if (existing) throw new Error("Username đã tồn tại.");
    const { data: created, error: authError } = await database().auth.admin.createUser({ email: usernameEmail(username), password: input.password, email_confirm: true });
    if (authError || !created.user) fail(authError, "Không thể tạo tài khoản Supabase");
    const { data, error } = await database().from("team_members").insert({
      id: created.user.id, name, role, work_type: input.workType, username, access_role: input.accessRole,
      avatar_url: cleanAvatar(input.avatarUrl) ?? null, initials: initialsFor(name), must_change_password: true
    }).select().single();
    if (error || !data) {
      await database().auth.admin.deleteUser(created.user.id);
      fail(error, "Không thể tạo hồ sơ thành viên");
    }
    return toMember(data as MemberRow);
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    if (data.members.some((member) => member.username === username)) throw new Error("Username đã tồn tại.");
    const member: StoredMember = {
      id: randomUUID(), name, role, username, workType: input.workType, accessRole: input.accessRole,
      avatarUrl: cleanAvatar(input.avatarUrl), mustChangePassword: true, initials: initialsFor(name),
      passwordHash: await hashPassword(initialPassword), createdAt: new Date().toISOString()
    };
    data.members.push(member);
    await writeWorkspace(data);
    return publicMember(member);
  });
}

export async function updateMember(id: string, input: TeamMemberInput): Promise<TeamMember | null> {
  const { name, role, username } = validateMemberInput(input);
  if (input.password && input.password.length < 8) throw new Error("Mật khẩu phải có ít nhất 8 ký tự.");
  if (isRemote()) {
    const previous = await findRemoteMember(id);
    if (!previous) return null;
    const members = await listMembers();
    if (previous.accessRole === "admin" && input.accessRole !== "admin" && members.filter((item) => item.accessRole === "admin").length <= 1) throw new Error("Không thể hạ quyền quản trị viên cuối cùng.");
    if (members.some((item) => item.id !== id && item.username === username)) throw new Error("Username đã tồn tại.");
    if (previous.username !== username || input.password) {
      const { error: authError } = await database().auth.admin.updateUserById(id, {
        ...(previous.username !== username ? { email: usernameEmail(username), email_confirm: true } : {}),
        ...(input.password ? { password: input.password } : {})
      });
      if (authError) fail(authError, "Không thể cập nhật tài khoản đăng nhập");
    }
    const { data, error } = await database().from("team_members").update({
      name, role, username, work_type: input.workType, access_role: input.accessRole,
      avatar_url: cleanAvatar(input.avatarUrl) ?? null, initials: initialsFor(name),
      must_change_password: input.password ? true : previous.mustChangePassword
    }).eq("id", id).select().single();
    if (error || !data) fail(error, "Không thể cập nhật thành viên");
    if (previous.name !== name) {
      const { error: taskError } = await database().from("tasks").update({ owner_name: name }).eq("owner_name", previous.name);
      if (taskError) fail(taskError, "Không thể cập nhật tên người phụ trách của task cũ");
    }
    return toMember(data as MemberRow);
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const index = data.members.findIndex((member) => member.id === id);
    if (index < 0) return null;
    const previous = data.members[index];
    if (previous.accessRole === "admin" && input.accessRole !== "admin" && data.members.filter((member) => member.accessRole === "admin").length <= 1) throw new Error("Không thể hạ quyền quản trị viên cuối cùng.");
    if (data.members.some((member) => member.id !== id && member.username === username)) throw new Error("Username đã tồn tại.");
    const member: StoredMember = {
      ...previous, name, role, username, workType: input.workType, accessRole: input.accessRole,
      avatarUrl: cleanAvatar(input.avatarUrl), initials: initialsFor(name),
      passwordHash: input.password ? await hashPassword(input.password) : previous.passwordHash,
      mustChangePassword: input.password ? true : previous.mustChangePassword
    };
    data.members[index] = member;
    if (previous.name !== name) syncLocalAssignments(data);
    await writeWorkspace(data);
    return publicMember(member);
  });
}

export async function updateCurrentProfile(id: string, input: { name: string; role: string; username: string; avatarUrl?: string; newPassword?: string }, authToken?: string | null): Promise<TeamMember | null> {
  const { name, role, username } = validateMemberInput({ ...input, workType: "inhouse", accessRole: "employee" });
  if (input.newPassword && input.newPassword.length < 8) throw new Error("Mật khẩu mới phải có ít nhất 8 ký tự.");
  if (isRemote()) {
    const previous = await findRemoteMember(id);
    if (!previous) return null;
    const members = await listMembers();
    if (members.some((item) => item.id !== id && item.username === username)) throw new Error("Username đã tồn tại.");
    if (input.newPassword) {
      const { error: passwordError } = await database().auth.admin.updateUserById(id, { password: input.newPassword });
      if (passwordError) fail(passwordError, "Không thể đổi mật khẩu");
    }
    if (previous.username !== username) {
      const { error: usernameError } = await database().auth.admin.updateUserById(id, { email: usernameEmail(username), email_confirm: true });
      if (usernameError) fail(usernameError, "Không thể cập nhật username đăng nhập");
    }
    const { data, error } = await database().from("team_members").update({
      name, role, username, avatar_url: cleanAvatar(input.avatarUrl) ?? null, initials: initialsFor(name),
      must_change_password: input.newPassword ? false : previous.mustChangePassword
    }).eq("id", id).select().single();
    if (error || !data) fail(error, "Không thể cập nhật hồ sơ");
    if (previous.name !== name) {
      const { error: taskError } = await database().from("tasks").update({ owner_name: name }).eq("owner_name", previous.name);
      if (taskError) fail(taskError, "Không thể cập nhật người phụ trách của task");
    }
    return toMember(data as MemberRow);
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const index = data.members.findIndex((member) => member.id === id);
    if (index < 0) return null;
    const previous = data.members[index];
    if (data.members.some((member) => member.id !== id && member.username === username)) throw new Error("Username đã tồn tại.");
    const member: StoredMember = {
      ...previous, name, role, username, avatarUrl: cleanAvatar(input.avatarUrl), initials: initialsFor(name),
      passwordHash: input.newPassword ? await hashPassword(input.newPassword) : previous.passwordHash,
      mustChangePassword: input.newPassword ? false : previous.mustChangePassword
    };
    data.members[index] = member;
    if (previous.name !== name) syncLocalAssignments(data);
    await writeWorkspace(data);
    return publicMember(member);
  });
}

export async function deleteMember(id: string): Promise<boolean> {
  if (isRemote()) {
    const member = await findRemoteMember(id);
    if (!member) return false;
    if (member.accessRole === "admin" && (await listMembers()).filter((item) => item.accessRole === "admin").length <= 1) throw new Error("Không thể xoá quản trị viên cuối cùng.");
    const { data: assignedRows, error: taskLoadError } = await database().from("tasks").select("id, assignee_ids").contains("assignee_ids", [id]);
    if (taskLoadError) fail(taskLoadError, "Không thể đọc công việc đã giao");
    const members = (await listMembers()).filter((item) => item.id !== id);
    for (const task of assignedRows ?? []) {
      const assigneeIds = ((task.assignee_ids ?? []) as string[]).filter((item) => item !== id);
      const { error: taskError } = await database().from("tasks").update({ assignee_ids: assigneeIds, owner_name: assigneeNames(assigneeIds, members) }).eq("id", task.id);
      if (taskError) fail(taskError, "Không thể cập nhật người phụ trách của công việc");
    }
    const { error } = await database().auth.admin.deleteUser(id);
    if (error) fail(error, "Không thể xoá thành viên");
    return true;
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const member = data.members.find((item) => item.id === id);
    if (!member) return false;
    if (member.accessRole === "admin" && data.members.filter((item) => item.accessRole === "admin").length <= 1) throw new Error("Không thể xoá quản trị viên cuối cùng.");
    data.members = data.members.filter((item) => item.id !== id);
    data.sessions = data.sessions.filter((item) => item.memberId !== id);
    data.notifications = data.notifications.filter((item) => item.userId !== id);
    data.pushSubscriptions = data.pushSubscriptions.filter((item) => item.userId !== id);
    data.tasks = data.tasks.map((task) => ({ ...task, assigneeIds: task.assigneeIds.filter((item) => item !== id) }));
    syncLocalAssignments(data);
    await writeWorkspace(data);
    return true;
  });
}

export async function listNotifications(userId: string) {
  if (isRemote()) {
    const { data, error } = await database().from("workspace_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(40);
    if (error) fail(error, "Không thể tải thông báo");
    return (data as NotificationRow[]).map(toNotification);
  }
  return (await readWorkspace()).notifications.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 40);
}

export async function getNotificationFeed(userId: string): Promise<NotificationFeed> {
  if (isRemote()) {
    // Existing Supabase installations may not have the optional feed RPC yet.
    // Use the notifications table already required by the original app so a
    // pending migration cannot make the entire notification center unavailable.
    const [recent, unread] = await Promise.all([
      database().from("workspace_notifications").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(40),
      database().from("workspace_notifications").select("id", { count: "exact", head: true })
        .eq("user_id", userId).is("read_at", null)
    ]);
    if (recent.error) fail(recent.error, "Không thể tải thông báo");
    if (unread.error) fail(unread.error, "Không thể đếm thông báo chưa đọc");
    return { notifications: (recent.data as NotificationRow[]).map(toNotification), unreadCount: unread.count ?? 0 };
  }
  const notifications = (await readWorkspace()).notifications.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return { notifications: notifications.slice(0, 40), unreadCount: notifications.filter((item) => !item.readAt).length };
}

export async function listNotificationsForTask(taskId: string) {
  if (isRemote()) {
    const { data, error } = await database().from("workspace_notifications").select("*").eq("task_id", taskId).order("created_at", { ascending: false }).limit(10);
    if (error) fail(error, "Không thể tải thông báo");
    return (data as NotificationRow[]).map(toNotification);
  }
  return (await readWorkspace()).notifications.filter((item) => item.taskId === taskId).slice(0, 10);
}

export async function markNotificationRead(userId: string, id: string) {
  if (isRemote()) {
    const { data, error } = await database().from("workspace_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select().maybeSingle();
    if (error) fail(error, "Không thể cập nhật thông báo");
    return data ? toNotification(data as NotificationRow) : null;
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const notification = data.notifications.find((item) => item.id === id && item.userId === userId);
    if (!notification) return null;
    notification.readAt = notification.readAt ?? new Date().toISOString();
    await writeWorkspace(data);
    return notification;
  });
}

export async function markAllNotificationsRead(userId: string) {
  const readAt = new Date().toISOString();
  if (isRemote()) {
    const { error } = await database().from("workspace_notifications").update({ read_at: readAt }).eq("user_id", userId).is("read_at", null);
    if (error) fail(error, "Không thể cập nhật thông báo");
    return;
  }
  await withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    for (const notification of data.notifications) {
      if (notification.userId === userId && !notification.readAt) notification.readAt = readAt;
    }
    await writeWorkspace(data);
  });
}

export class NotificationReminderCooldownError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`Vui lòng đợi ${retryAfter} giây trước khi nhắc lại.`);
    this.name = "NotificationReminderCooldownError";
  }
}

/** Reissue the existing notification so repeated reminders cannot create duplicates. */
export async function remindNotification(userId: string, id: string, now = new Date()) {
  const remindedAt = now.toISOString();
  if (isRemote()) {
    const cutoff = new Date(now.getTime() - NOTIFICATION_REMINDER_COOLDOWN_MS).toISOString();
    // The conditional UPDATE is atomic across requests and server instances.
    const { data, error } = await database().from("workspace_notifications")
      .update({ reminded_at: remindedAt, read_at: null, created_at: remindedAt })
      .eq("id", id).eq("user_id", userId)
      .or(`reminded_at.is.null,reminded_at.lte.${cutoff}`).select().maybeSingle();
    if (error) fail(error, "Không thể gửi lại nhắc nhở");
    if (data) return toNotification(data as NotificationRow);
    const { data: existing, error: readError } = await database().from("workspace_notifications").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (readError) fail(readError, "Không thể đọc thông báo");
    if (!existing) return null;
    throw new NotificationReminderCooldownError(Math.max(1, reminderRetryAfter(toNotification(existing as NotificationRow), now.getTime())));
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const notification = data.notifications.find((item) => item.id === id && item.userId === userId);
    if (!notification) return null;
    const retryAfter = reminderRetryAfter(notification, now.getTime());
    if (retryAfter) throw new NotificationReminderCooldownError(retryAfter);
    notification.remindedAt = remindedAt;
    notification.createdAt = remindedAt;
    notification.readAt = null;
    await writeWorkspace(data);
    return notification;
  });
}

export async function scheduleNotification(userId: string, id: string, scheduledAt: string, repeat: Task["reminderRepeat"], now = new Date()) {
  const time = Date.parse(scheduledAt);
  if (!Number.isFinite(time) || time <= now.getTime() || time > now.getTime() + 366 * 86_400_000 || !["none", "daily", "weekly"].includes(repeat)) {
    throw new TaskValidationError("Lịch nhắc phải ở tương lai và trong vòng một năm.");
  }
  const at = new Date(time).toISOString();
  if (isRemote()) {
    const { data, error } = await database().from("workspace_notifications").update({ scheduled_at: at, scheduled_repeat: repeat })
      .eq("id", id).eq("user_id", userId).select().maybeSingle();
    if (error) fail(error, "Không thể đặt lịch nhắc");
    return data ? toNotification(data as NotificationRow) : null;
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const notification = data.notifications.find((item) => item.id === id && item.userId === userId);
    if (!notification) return null;
    notification.scheduledAt = at;
    notification.scheduledRepeat = repeat;
    await writeWorkspace(data);
    return notification;
  });
}

export async function savePushSubscription(userId: string, subscription: Pick<PushSubscriptionRecord, "endpoint" | "keys">) {
  if (isRemote()) {
    const { data, error } = await database().from("push_subscriptions").upsert({ user_id: userId, endpoint: subscription.endpoint, keys: subscription.keys }, { onConflict: "endpoint" }).select().single();
    if (error || !data) fail(error, "Không thể lưu thiết bị nhận thông báo");
    return toPushSubscription(data as PushRow);
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    data.pushSubscriptions = data.pushSubscriptions.filter((item) => item.endpoint !== subscription.endpoint);
    const saved: PushSubscriptionRecord = { id: randomUUID(), userId, ...subscription, createdAt: new Date().toISOString() };
    data.pushSubscriptions.push(saved);
    await writeWorkspace(data);
    return saved;
  });
}

export async function removePushSubscription(userId: string, endpoint: string) {
  if (isRemote()) {
    const { error, count } = await database().from("push_subscriptions").delete({ count: "exact" }).eq("user_id", userId).eq("endpoint", endpoint);
    if (error) fail(error, "Không thể xoá thiết bị nhận thông báo");
    return (count ?? 0) > 0;
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    const before = data.pushSubscriptions.length;
    data.pushSubscriptions = data.pushSubscriptions.filter((item) => item.userId !== userId || item.endpoint !== endpoint);
    if (before !== data.pushSubscriptions.length) await writeWorkspace(data);
    return before !== data.pushSubscriptions.length;
  });
}

export async function listPushSubscriptions(userIds: string[]) {
  if (!userIds.length) return [];
  if (isRemote()) {
    const { data, error } = await database().from("push_subscriptions").select("*").in("user_id", userIds);
    if (error) fail(error, "Không thể tải thiết bị nhận thông báo");
    return (data as PushRow[]).map(toPushSubscription);
  }
  const ids = new Set(userIds);
  return (await readWorkspace()).pushSubscriptions.filter((item) => ids.has(item.userId));
}

function vietnamDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (part: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === part)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function createDeadlineReminders(now = new Date()) {
  if (!isRemote()) return withWorkspaceTransaction(() => recordDeadlineReminders(now));
  return recordDeadlineReminders(now);
}

export async function createScheduledReminders(now = new Date(), userId?: string) {
  if (!isRemote()) return withWorkspaceTransaction(() => recordScheduledReminders(now, userId));
  return recordScheduledReminders(now, userId);
}

async function recordScheduledReminders(now: Date, userId?: string) {
  const created: WorkspaceNotification[] = [];
  const localData = isRemote() ? undefined : await readWorkspace();
  const settings = localData?.settings ?? await getProjectSettings();
  if (!settings.notificationEvents.task_due) return created;
  const [tasks, members] = localData
    ? [localData.tasks, localData.members.map(publicMember)] as const
    : await Promise.all([listTasks(), listMembers()]);
  const today = vietnamNow(now).date;
  for (const task of tasks) {
    const relativeOffsets = dueRelativeOffsets(task, now);
    if (!taskReminderDue(task, now) && !relativeOffsets.length) continue;
    for (const assigneeId of taskAssigneeIds(task, members)) {
      if (userId && assigneeId !== userId) continue;
      const keys = [...(taskReminderDue(task, now) ? [`scheduled:${task.id}:${today}`] : []), ...relativeOffsets.map((offset) => `relative:${task.id}:${task.startDate}:${task.startTime}:${offset}`)];
      for (const eventKey of keys) {
        const payload = { userId: assigneeId, taskId: task.id, kind: "task_due" as const, title: "Nhắc công việc theo lịch",
          body: `${task.title}`, eventKey };
        const notification = localData ? addLocalNotification(localData, payload) : await addRemoteNotification(payload);
        if (notification) created.push(notification);
      }
    }
  }
  if (localData) {
    for (const notification of localData.notifications) {
      if (userId && notification.userId !== userId) continue;
      if (!notification.scheduledAt || Date.parse(notification.scheduledAt) > now.getTime()) continue;
      notification.remindedAt = now.toISOString();
      notification.createdAt = now.toISOString();
      notification.readAt = null;
      let next = nextScheduledAt(notification.scheduledAt, notification.scheduledRepeat ?? "none");
      while (next && Date.parse(next) <= now.getTime()) next = nextScheduledAt(next, notification.scheduledRepeat ?? "none");
      notification.scheduledAt = next;
      created.push({ ...notification });
    }
    if (created.length) await writeWorkspace(localData);
  } else {
    let query = database().from("workspace_notifications").select("*").lte("scheduled_at", now.toISOString());
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query.limit(100);
    if (error) fail(error, "Không thể tải lịch nhắc");
    for (const row of (data ?? []) as NotificationRow[]) {
      let next = nextScheduledAt(row.scheduled_at!, row.scheduled_repeat ?? "none");
      while (next && Date.parse(next) <= now.getTime()) next = nextScheduledAt(next, row.scheduled_repeat ?? "none");
      const result = await database().from("workspace_notifications")
        .update({ scheduled_at: next, reminded_at: now.toISOString(), read_at: null, created_at: now.toISOString() })
        .eq("id", row.id).eq("scheduled_at", row.scheduled_at!).select().maybeSingle();
      if (result.error) fail(result.error, "Không thể gửi nhắc nhở theo lịch");
      if (result.data) created.push(toNotification(result.data as NotificationRow));
    }
  }
  return created;
}

async function recordDeadlineReminders(now: Date) {
  const today = vietnamDate(now);
  const result: WorkspaceNotification[] = [];
  const settings = await getProjectSettings();
  if (!settings.notificationEvents.task_due && !settings.notificationEvents.task_overdue) return result;
  const [tasks, members] = await Promise.all([listTasks(), listMembers()]);
  const localData = isRemote() ? undefined : await readWorkspace();
  for (const task of tasks) {
    if (!task.deadline || task.status === "completed") continue;
    const kind: NotificationKind | null = task.deadline === today ? "task_due" : task.deadline < today ? "task_overdue" : null;
    if (!kind) continue;
    if (!settings.notificationEvents[kind]) continue;
    for (const userId of taskAssigneeIds(task, members)) {
      const payload: Omit<WorkspaceNotification, "id" | "createdAt" | "readAt"> = {
        userId, taskId: task.id, kind, title: kind === "task_due" ? "Task đến hạn hôm nay" : "Task đã quá hạn",
          body: `${task.title} · Hạn ${task.deadline}`, eventKey: `${kind}:${task.id}:${today}`
      };
      const created = isRemote() ? await addRemoteNotification(payload) : localData ? addLocalNotification(localData, payload) : null;
      if (created) result.push(created);
    }
  }
  if (localData && result.length) await writeWorkspace(localData);
  return result;
}

export const unassignedOwner = UNASSIGNED;

export async function getProjectSettings(): Promise<ProjectSettings> {
  if (isRemote()) {
    const { data, error } = await database().from("workspace_settings").select("*").eq("id", 1).maybeSingle();
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return DEFAULT_PROJECT_SETTINGS;
      fail(error, "Không thể tải cài đặt dự án");
    }
    return data ? {
      ...DEFAULT_PROJECT_SETTINGS,
      projectName: data.project_name ?? DEFAULT_PROJECT_SETTINGS.projectName,
      projectDescription: data.project_description ?? "",
      projectLogoUrl: data.project_logo_url ?? "",
      notificationEvents: { ...DEFAULT_PROJECT_SETTINGS.notificationEvents, ...(data.notification_events ?? {}) },
      accentColor: data.accent_color,
      backgroundPreset: data.background_preset,
      backgroundImage: data.background_image,
      notificationTone: data.notification_tone,
      themeMode: data.theme_mode ?? "light",
      highContrast: data.high_contrast ?? false
    } : DEFAULT_PROJECT_SETTINGS;
  }
  return (await readWorkspace()).settings;
}

export async function saveProjectSettings(settings: ProjectSettings): Promise<ProjectSettings> {
  const normalized: ProjectSettings = {
    ...settings,
    projectName: settings.projectName.trim(),
    projectDescription: settings.projectDescription.trim(),
    projectLogoUrl: settings.projectLogoUrl.trim(),
    notificationEvents: { ...settings.notificationEvents }
  };
  const current = await getProjectSettings();
  if (JSON.stringify(normalized) === JSON.stringify(current)) return current;
  if (isRemote()) {
    const { data, error } = await database().from("workspace_settings").upsert({
      id: 1,
      project_name: normalized.projectName,
      project_description: normalized.projectDescription,
      project_logo_url: normalized.projectLogoUrl,
      notification_events: normalized.notificationEvents,
      accent_color: normalized.accentColor,
      background_preset: normalized.backgroundPreset,
      background_image: normalized.backgroundImage,
      notification_tone: normalized.notificationTone,
      theme_mode: normalized.themeMode,
      high_contrast: normalized.highContrast,
      updated_at: new Date().toISOString()
    }).select().single();
    if (error || !data) fail(error, "Không thể lưu cài đặt dự án");
    return {
      ...DEFAULT_PROJECT_SETTINGS,
      projectName: data.project_name,
      projectDescription: data.project_description ?? "",
      projectLogoUrl: data.project_logo_url ?? "",
      notificationEvents: { ...DEFAULT_PROJECT_SETTINGS.notificationEvents, ...(data.notification_events ?? {}) },
      accentColor: data.accent_color,
      backgroundPreset: data.background_preset,
      backgroundImage: data.background_image,
      notificationTone: data.notification_tone,
      themeMode: data.theme_mode,
      highContrast: data.high_contrast
    };
  }
  return withWorkspaceTransaction(async () => {
    const data = await readWorkspace();
    data.settings = normalized;
    await writeWorkspace(data);
    return normalized;
  });
}
