import type { Task, TeamMember } from "./types";

/** Number of unfinished tasks considered a sustainable maximum for one person. */
export const ACTIVE_TASK_CAPACITY = 5;

export type WorkloadLevel = "balanced" | "watch" | "overloaded";

export type WorkloadAssessment = {
  member: TeamMember;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  dueSoon: number;
  overdue: number;
  capacity: number;
  utilization: number;
  completionRate: number;
  level: WorkloadLevel;
  label: string;
  recommendation: string;
};

function vietnamToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function assessmentLevel(activeTasks: number, dueSoon: number, overdue: number): WorkloadLevel {
  if (activeTasks > ACTIVE_TASK_CAPACITY || overdue >= 2) return "overloaded";
  if (activeTasks >= ACTIVE_TASK_CAPACITY - 1 || dueSoon >= 2 || overdue > 0) return "watch";
  return "balanced";
}

export function assessWorkload(tasks: Task[], members: TeamMember[], asOf = new Date()): WorkloadAssessment[] {
  const today = vietnamToday(asOf);
  const knownPeople = new Map(members.map((member) => [member.name.trim().toLocaleLowerCase(), member]));

  for (const task of tasks) {
    const key = task.owner.trim().toLocaleLowerCase();
    if (key && key !== "chưa phân công" && !knownPeople.has(key)) {
      knownPeople.set(key, { id: `owner-${key}`, name: task.owner, role: "Chưa có hồ sơ thành viên", workType: task.workType, username: `owner-${key}`, accessRole: "employee", mustChangePassword: false, initials: task.owner.split(/\s+/).slice(-2).map((word) => word[0]).join("").toUpperCase(), createdAt: task.createdAt });
    }
  }

  return [...knownPeople.values()].map((member) => {
    const assigned = tasks.filter((task) => task.owner.trim().toLocaleLowerCase() === member.name.trim().toLocaleLowerCase());
    const active = assigned.filter((task) => task.status !== "completed");
    const overdue = active.filter((task) => task.deadline && task.deadline < today).length;
    const dueSoon = active.filter((task) => task.deadline && daysBetween(today, task.deadline) >= 0 && daysBetween(today, task.deadline) <= 2).length;
    const level = assessmentLevel(active.length, dueSoon, overdue);
    const completionRate = assigned.length ? Math.round(assigned.filter((task) => task.status === "completed").length / assigned.length * 100) : 0;
    const recommendations: Record<WorkloadLevel, string> = {
      overloaded: "Nên phân bổ bớt task hoặc điều chỉnh deadline.",
      watch: "Theo dõi tiến độ và ưu tiên các deadline gần.",
      balanced: "Khối lượng đang trong mức có thể xử lý."
    };
    const labels: Record<WorkloadLevel, string> = { overloaded: "Quá tải", watch: "Cần theo dõi", balanced: "Ổn định" };
    return { member, totalTasks: assigned.length, activeTasks: active.length, completedTasks: assigned.length - active.length, dueSoon, overdue, capacity: ACTIVE_TASK_CAPACITY, utilization: Math.round(active.length / ACTIVE_TASK_CAPACITY * 100), completionRate, level, label: labels[level], recommendation: recommendations[level] };
  }).sort((a, b) => b.utilization - a.utilization || b.overdue - a.overdue || a.member.name.localeCompare(b.member.name, "vi"));
}
