import { randomUUID } from "node:crypto";
import { hashPassword } from "./password";
import { createSupabaseAuthClient, hasSupabaseBackend, supabaseAdmin } from "./supabase-admin";
import { readWorkspace, writeWorkspace, type StoredMember } from "./workspace-store";
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

type TaskRow = { id: string; code: string; title: string; owner_name: string; work_type: WorkType; status: TaskStatus; start_date: string | null; deadline: string | null; start_time: string; end_time: string; format: string; brief: string; created_at: string; updated_at: string };
type MemberRow = { id: string; name: string; role: string; work_type: WorkType; username: string; access_role: AccessRole; avatar_url: string | null; initials: string; must_change_password: boolean; created_at: string };
type NotificationRow = { id: string; user_id: string; task_id: string | null; kind: NotificationKind; title: string; body: string; event_key: string; read_at: string | null; created_at: string };
type PushRow = { id: string; user_id: string; endpoint: string; keys: { p256dh: string; auth: string }; created_at: string };

const toTask = (row: TaskRow): Task => ({
  id: row.id, code: row.code, title: row.title, owner: row.owner_name || UNASSIGNED, workType: row.work_type,
  status: row.status, startDate: row.start_date ?? row.deadline, deadline: row.deadline, startTime: row.start_time.slice(0, 5), endTime: row.end_time?.slice(0, 5) ?? "11:00", format: row.format,
  brief: row.brief, createdAt: row.created_at, updatedAt: row.updated_at
});
const toMember = (row: MemberRow): TeamMember => ({
  id: row.id, name: row.name, role: row.role, workType: row.work_type, username: row.username,
  accessRole: row.access_role, avatarUrl: row.avatar_url ?? undefined, initials: row.initials,
  mustChangePassword: row.must_change_password, createdAt: row.created_at
});
const toNotification = (row: NotificationRow): WorkspaceNotification => ({
  id: row.id, userId: row.user_id, taskId: row.task_id ?? undefined, kind: row.kind, title: row.title,
  body: row.body, eventKey: row.event_key, readAt: row.read_at, createdAt: row.created_at
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

function nextCode(tasks: Pick<Task, "code">[]) {
  const prefix = `T${new Date().getMonth() + 1}-`;
  const next = Math.max(0, ...tasks.filter((task) => task.code.startsWith(prefix)).map((task) => Number(task.code.slice(prefix.length)) || 0)) + 1;
  return `${prefix}${String(next).padStart(2, "0")}`;
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "09:00";
}

function applyOwnerType(input: TaskInput, members: TeamMember[]) {
  const owner = input.owner.trim() || UNASSIGNED;
  const member = members.find((item) => item.name === owner);
  return { ...input, owner, workType: member?.workType ?? input.workType, startTime: validTime(input.startTime) };
}

function normalizeSchedule(input: TaskInput): TaskInput {
  const startDate = input.startDate || input.deadline;
  const deadline = input.deadline || startDate;
  const startTime = validTime(input.startTime);
  const endTime = validTime(input.endTime);
  if (!startDate || !deadline) throw new Error("Vui lòng chọn ngày bắt đầu và ngày kết thúc.");
  if (startDate > deadline) throw new Error("Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.");
  if (endTime <= startTime) throw new Error("Giờ kết thúc phải sau giờ bắt đầu.");
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
  if (existing) return existing;
  const created: WorkspaceNotification = { ...notification, id: randomUUID(), readAt: null, createdAt: new Date().toISOString() };
  data.notifications.unshift(created);
  data.notifications = data.notifications.slice(0, 500);
  return created;
}

async function notifyAssignee(task: Task, localData?: Awaited<ReturnType<typeof readWorkspace>>) {
  if (isRemote()) {
    const owner = (await listMembers()).find((member) => member.name === task.owner);
    if (!owner) return null;
    return addRemoteNotification({
      userId: owner.id, taskId: task.id, kind: "task_assigned", title: "Bạn có công việc mới",
      body: `${task.code} · ${task.title}${task.deadline ? ` · Hạn ${task.deadline}` : ""}`,
      eventKey: `assigned:${task.id}:${owner.id}`
    });
  }
  const owner = localData?.members.find((member) => member.name === task.owner);
  if (!owner || !localData) return null;
  return addLocalNotification(localData, {
    userId: owner.id, taskId: task.id, kind: "task_assigned", title: "Bạn có công việc mới",
    body: `${task.code} · ${task.title}${task.deadline ? ` · Hạn ${task.deadline}` : ""}`,
    eventKey: `assigned:${task.id}:${owner.id}`
  });
}

export async function listTasks(): Promise<Task[]> {
  if (isRemote()) {
    const { data, error } = await database().from("tasks").select("*").order("deadline", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
    if (error) fail(error, "Không thể tải công việc");
    return (data as TaskRow[]).map(toTask);
  }
  return (await readWorkspace()).tasks.sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}

export async function createTask(input: TaskInput): Promise<Task> {
  if (isRemote()) {
    const clean = normalizeSchedule(applyOwnerType(input, await listMembers()));
    if (!clean.title.trim()) throw new Error("Tên công việc là bắt buộc.");
    const { data, error } = await database().from("tasks").insert({
      code: nextCode(await listTasks()), title: clean.title.trim(), owner_name: clean.owner,
      work_type: clean.workType, status: clean.status, start_date: clean.startDate || null, deadline: clean.deadline || null,
      start_time: clean.startTime, end_time: clean.endTime, format: clean.format.trim() || "Chưa xác định", brief: clean.brief.trim()
    }).select().single();
    if (error || !data) fail(error, "Không thể tạo công việc");
    const task = toTask(data as TaskRow);
    await notifyAssignee(task);
    return task;
  }
  const data = await readWorkspace();
  const clean = normalizeSchedule(applyOwnerType(input, data.members.map(publicMember)));
  if (!clean.title.trim()) throw new Error("Tên công việc là bắt buộc.");
  const now = new Date().toISOString();
  const task: Task = {
    id: randomUUID(), code: nextCode(data.tasks), ...clean, title: clean.title.trim(), deadline: clean.deadline || null,
    format: clean.format.trim() || "Chưa xác định", brief: clean.brief.trim(), createdAt: now, updatedAt: now
  };
  data.tasks.push(task);
  await notifyAssignee(task, data);
  await writeWorkspace(data);
  return task;
}

export async function updateTask(id: string, input: Partial<TaskInput>): Promise<Task | null> {
  if (isRemote()) {
    const { data: existing, error: loadError } = await database().from("tasks").select("*").eq("id", id).maybeSingle();
    if (loadError) fail(loadError, "Không thể đọc công việc");
    if (!existing) return null;
    const previous = toTask(existing as TaskRow);
    const merged: TaskInput = {
      title: input.title ?? previous.title, owner: input.owner ?? previous.owner, workType: input.workType ?? previous.workType,
      status: input.status ?? previous.status, deadline: input.deadline === "" ? null : input.deadline ?? previous.deadline,
      startDate: input.startDate === "" ? null : input.startDate ?? previous.startDate ?? previous.deadline,
      startTime: input.startTime ?? previous.startTime, endTime: input.endTime ?? previous.endTime, format: input.format ?? previous.format, brief: input.brief ?? previous.brief
    };
    const clean = normalizeSchedule(applyOwnerType(merged, await listMembers()));
    if (!clean.title.trim()) throw new Error("Tên công việc là bắt buộc.");
    const { data, error } = await database().from("tasks").update({
      title: clean.title.trim(), owner_name: clean.owner, work_type: clean.workType, status: clean.status,
      start_date: clean.startDate || null, deadline: clean.deadline || null, start_time: clean.startTime, end_time: clean.endTime, format: clean.format.trim() || "Chưa xác định", brief: clean.brief.trim()
    }).eq("id", id).select().single();
    if (error || !data) fail(error, "Không thể cập nhật công việc");
    const task = toTask(data as TaskRow);
    if (task.owner !== previous.owner) await notifyAssignee(task);
    return task;
  }
  const data = await readWorkspace();
  const index = data.tasks.findIndex((task) => task.id === id);
  if (index < 0) return null;
  const previous = data.tasks[index];
  const merged: TaskInput = {
    title: input.title ?? previous.title, owner: input.owner ?? previous.owner, workType: input.workType ?? previous.workType,
    status: input.status ?? previous.status, deadline: input.deadline === "" ? null : input.deadline ?? previous.deadline,
    startDate: input.startDate === "" ? null : input.startDate ?? previous.startDate ?? previous.deadline,
    startTime: input.startTime ?? previous.startTime, endTime: input.endTime ?? previous.endTime, format: input.format ?? previous.format, brief: input.brief ?? previous.brief
  };
  const clean = normalizeSchedule(applyOwnerType(merged, data.members.map(publicMember)));
  if (!clean.title.trim()) throw new Error("Tên công việc là bắt buộc.");
  const updated: Task = { ...previous, ...clean, title: clean.title.trim(), format: clean.format.trim() || "Chưa xác định", brief: clean.brief.trim(), updatedAt: new Date().toISOString() };
  data.tasks[index] = updated;
  if (updated.owner !== previous.owner) await notifyAssignee(updated, data);
  await writeWorkspace(data);
  return updated;
}

export async function deleteTask(id: string) {
  if (isRemote()) {
    const { error, count } = await database().from("tasks").delete({ count: "exact" }).eq("id", id);
    if (error) fail(error, "Không thể xoá công việc");
    return (count ?? 0) > 0;
  }
  const data = await readWorkspace();
  const length = data.tasks.length;
  data.tasks = data.tasks.filter((task) => task.id !== id);
  if (data.tasks.length === length) return false;
  await writeWorkspace(data);
  return true;
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
  const data = await readWorkspace();
  if (data.members.some((member) => member.username === username)) throw new Error("Username đã tồn tại.");
  const member: StoredMember = {
    id: randomUUID(), name, role, username, workType: input.workType, accessRole: input.accessRole,
    avatarUrl: cleanAvatar(input.avatarUrl), mustChangePassword: true, initials: initialsFor(name),
    passwordHash: await hashPassword(input.password), createdAt: new Date().toISOString()
  };
  data.members.push(member);
  await writeWorkspace(data);
  return publicMember(member);
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
      if (taskError) fail(taskError, "Không thể cập nhật người phụ trách của task");
    }
    return toMember(data as MemberRow);
  }
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
  if (previous.name !== name) data.tasks = data.tasks.map((task) => task.owner === previous.name ? { ...task, owner: name, updatedAt: new Date().toISOString() } : task);
  await writeWorkspace(data);
  return publicMember(member);
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
  if (previous.name !== name) data.tasks = data.tasks.map((task) => task.owner === previous.name ? { ...task, owner: name, updatedAt: new Date().toISOString() } : task);
  await writeWorkspace(data);
  return publicMember(member);
}

export async function deleteMember(id: string): Promise<boolean> {
  if (isRemote()) {
    const member = await findRemoteMember(id);
    if (!member) return false;
    if (member.accessRole === "admin" && (await listMembers()).filter((item) => item.accessRole === "admin").length <= 1) throw new Error("Không thể xoá quản trị viên cuối cùng.");
    const { error: taskError } = await database().from("tasks").update({ owner_name: UNASSIGNED }).eq("owner_name", member.name);
    if (taskError) fail(taskError, "Không thể chuyển task chưa phân công");
    const { error } = await database().auth.admin.deleteUser(id);
    if (error) fail(error, "Không thể xoá thành viên");
    return true;
  }
  const data = await readWorkspace();
  const member = data.members.find((item) => item.id === id);
  if (!member) return false;
  if (member.accessRole === "admin" && data.members.filter((item) => item.accessRole === "admin").length <= 1) throw new Error("Không thể xoá quản trị viên cuối cùng.");
  data.members = data.members.filter((item) => item.id !== id);
  data.notifications = data.notifications.filter((item) => item.userId !== id);
  data.pushSubscriptions = data.pushSubscriptions.filter((item) => item.userId !== id);
  data.tasks = data.tasks.map((task) => task.owner === member.name ? { ...task, owner: UNASSIGNED, updatedAt: new Date().toISOString() } : task);
  await writeWorkspace(data);
  return true;
}

export async function listNotifications(userId: string) {
  if (isRemote()) {
    const { data, error } = await database().from("workspace_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(40);
    if (error) fail(error, "Không thể tải thông báo");
    return (data as NotificationRow[]).map(toNotification);
  }
  return (await readWorkspace()).notifications.filter((item) => item.userId === userId).slice(0, 40);
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
  const data = await readWorkspace();
  const notification = data.notifications.find((item) => item.id === id && item.userId === userId);
  if (!notification) return null;
  notification.readAt = notification.readAt ?? new Date().toISOString();
  await writeWorkspace(data);
  return notification;
}

export async function savePushSubscription(userId: string, subscription: Pick<PushSubscriptionRecord, "endpoint" | "keys">) {
  if (isRemote()) {
    const { data, error } = await database().from("push_subscriptions").upsert({ user_id: userId, endpoint: subscription.endpoint, keys: subscription.keys }, { onConflict: "endpoint" }).select().single();
    if (error || !data) fail(error, "Không thể lưu thiết bị nhận thông báo");
    return toPushSubscription(data as PushRow);
  }
  const data = await readWorkspace();
  data.pushSubscriptions = data.pushSubscriptions.filter((item) => item.endpoint !== subscription.endpoint);
  const saved: PushSubscriptionRecord = { id: randomUUID(), userId, ...subscription, createdAt: new Date().toISOString() };
  data.pushSubscriptions.push(saved);
  await writeWorkspace(data);
  return saved;
}

export async function removePushSubscription(userId: string, endpoint: string) {
  if (isRemote()) {
    const { error, count } = await database().from("push_subscriptions").delete({ count: "exact" }).eq("user_id", userId).eq("endpoint", endpoint);
    if (error) fail(error, "Không thể xoá thiết bị nhận thông báo");
    return (count ?? 0) > 0;
  }
  const data = await readWorkspace();
  const before = data.pushSubscriptions.length;
  data.pushSubscriptions = data.pushSubscriptions.filter((item) => item.userId !== userId || item.endpoint !== endpoint);
  if (before !== data.pushSubscriptions.length) await writeWorkspace(data);
  return before !== data.pushSubscriptions.length;
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
  const today = vietnamDate(now);
  const result: WorkspaceNotification[] = [];
  const [tasks, members] = await Promise.all([listTasks(), listMembers()]);
  const localData = isRemote() ? undefined : await readWorkspace();
  for (const task of tasks) {
    if (!task.deadline || task.status === "completed") continue;
    const owner = members.find((member) => member.name === task.owner);
    const kind: NotificationKind | null = task.deadline === today ? "task_due" : task.deadline < today ? "task_overdue" : null;
    if (!owner || !kind) continue;
    const payload: Omit<WorkspaceNotification, "id" | "createdAt" | "readAt"> = {
      userId: owner.id, taskId: task.id, kind, title: kind === "task_due" ? "Task đến hạn hôm nay" : "Task đã quá hạn",
      body: `${task.code} · ${task.title} · Hạn ${task.deadline}`, eventKey: `${kind}:${task.id}:${today}`
    };
    const created = isRemote() ? await addRemoteNotification(payload) : localData ? addLocalNotification(localData, payload) : null;
    if (created) result.push(created);
  }
  if (localData && result.length) await writeWorkspace(localData);
  return result;
}

export const unassignedOwner = UNASSIGNED;
