import type { ReminderRepeat, Task } from "./types";

export function vietnamNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function taskReminderDue(task: Pick<Task, "status" | "reminderDate" | "reminderTime" | "reminderRepeat" | "deadline">, now: Date) {
  if (task.status === "completed" || !task.reminderDate || !task.reminderTime) return false;
  const current = vietnamNow(now);
  if (current.date < task.reminderDate || current.time < task.reminderTime || (task.deadline && current.date > task.deadline)) return false;
  if (task.reminderRepeat === "none") return current.date === task.reminderDate;
  if (task.reminderRepeat === "daily") return true;
  const days = Math.round((Date.parse(`${current.date}T00:00:00Z`) - Date.parse(`${task.reminderDate}T00:00:00Z`)) / 86_400_000);
  return days >= 0 && days % 7 === 0;
}

export function nextScheduledAt(at: string, repeat: ReminderRepeat) {
  if (repeat === "none") return null;
  const next = new Date(at);
  next.setUTCDate(next.getUTCDate() + (repeat === "weekly" ? 7 : 1));
  return next.toISOString();
}
