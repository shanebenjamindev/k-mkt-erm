export const TASK_STATUSES = ["todo", "in_progress", "pending_review", "completed"] as const;
export const WORK_TYPES = ["inhouse", "outsource"] as const;
export const ACCESS_ROLES = ["admin", "employee"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type WorkType = (typeof WORK_TYPES)[number];
export type AccessRole = (typeof ACCESS_ROLES)[number];
export type ReminderRepeat = "none" | "daily" | "weekly";

export type BriefImage = { id: string; src?: string; source?: "upload" | "url"; driveFileId?: string; title: string; content: string; createdAt: string };

export type Task = {
  id: string;
  title: string;
  owner: string;
  assigneeIds: string[];
  reminderDate: string | null;
  reminderTime: string | null;
  reminderRepeat: ReminderRepeat;
  reminderOffsets: number[];
  workType: WorkType;
  status: TaskStatus;
  startDate: string | null;
  deadline: string | null;
  startTime: string;
  endTime: string;
  format: string;
  brief: string;
  briefUrl: string | null;
  briefFinalUrl: string | null;
  briefImages: BriefImage[];
  linkedBriefIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  workType: WorkType;
  username: string;
  accessRole: AccessRole;
  avatarUrl?: string;
  mustChangePassword: boolean;
  initials: string;
  createdAt: string;
};

export type TaskInput = Pick<Task, "title" | "owner" | "workType" | "status" | "startDate" | "deadline" | "startTime" | "endTime" | "format" | "brief"> & { assigneeIds?: string[]; briefUrl?: string | null; briefFinalUrl?: string | null; briefImages?: BriefImage[]; linkedBriefIds?: string[]; reminderDate?: string | null; reminderTime?: string | null; reminderRepeat?: ReminderRepeat; reminderOffsets?: number[] };
export type TeamMemberInput = Pick<TeamMember, "name" | "role" | "workType" | "username" | "accessRole" | "avatarUrl"> & { password?: string };

export type NotificationKind = "task_assigned" | "task_due" | "task_overdue";

export type WorkspaceNotification = {
  id: string;
  userId: string;
  taskId?: string;
  kind: NotificationKind;
  title: string;
  body: string;
  eventKey: string;
  readAt: string | null;
  remindedAt?: string | null;
  scheduledAt?: string | null;
  scheduledRepeat?: ReminderRepeat;
  createdAt: string;
};

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
};

export const statusLabels: Record<TaskStatus, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  pending_review: "Chờ duyệt",
  completed: "Đã hoàn thành"
};

export const workTypeLabels: Record<WorkType, string> = {
  inhouse: "In-house",
  outsource: "Outsource"
};

export const accessRoleLabels: Record<AccessRole, string> = {
  admin: "Quản trị viên",
  employee: "Nhân viên"
};

/** Older tasks only have a deadline; treat it as a one-day schedule. */
export function taskStartDate(task: Pick<Task, "startDate" | "deadline">) {
  return task.startDate ?? task.deadline;
}

export function taskCoversDate(task: Pick<Task, "startDate" | "deadline">, date: string) {
  const start = taskStartDate(task);
  return Boolean(start && task.deadline && start <= date && date <= task.deadline);
}

export function initialsFor(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "TM";
}
