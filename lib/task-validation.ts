import { TASK_STATUSES, WORK_TYPES, type TaskInput } from "./types";

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

const fields = ["title", "owner", "assigneeIds", "linkedBriefIds", "format", "brief", "briefUrl", "briefFinalUrl", "briefImages", "startDate", "deadline", "startTime", "endTime", "workType", "status", "reminderDate", "reminderTime", "reminderRepeat", "reminderOffsets"] as const;

export function isTaskPatch(value: unknown): value is Partial<TaskInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!Object.keys(item).some((key) => fields.includes(key as typeof fields[number]))) return false;
  for (const field of ["title", "owner"] as const) {
    if (item[field] !== undefined && (typeof item[field] !== "string" || !item[field].trim())) return false;
  }
  if (item.assigneeIds !== undefined && (!Array.isArray(item.assigneeIds) || item.assigneeIds.length > 100 || !item.assigneeIds.every((id: unknown) => typeof id === "string" && id.length > 0) || new Set(item.assigneeIds).size !== item.assigneeIds.length)) return false;
  if (item.linkedBriefIds !== undefined && (!Array.isArray(item.linkedBriefIds) || item.linkedBriefIds.length > 50 || !item.linkedBriefIds.every((id: unknown) => typeof id === "string" && id.length > 0) || new Set(item.linkedBriefIds).size !== item.linkedBriefIds.length)) return false;
  if (item.briefFinalUrl !== undefined && item.briefFinalUrl !== null) {
    if (typeof item.briefFinalUrl !== "string" || item.briefFinalUrl.length > 2048) return false;
    try { if (new URL(item.briefFinalUrl).protocol !== "https:") return false; }
    catch { return false; }
  }
  if (item.briefImages !== undefined && (!Array.isArray(item.briefImages) || item.briefImages.length > 1000 || !item.briefImages.every((image: any) => image && typeof image.id === "string" && image.id.length <= 100 && (typeof image.src === "string" && image.src.startsWith("/api/brief-images/") || typeof image.driveFileId === "string" && /^[a-zA-Z0-9_-]{10,200}$/.test(image.driveFileId)) && typeof image.title === "string" && image.title.length <= 200 && typeof image.content === "string" && image.content.length <= 2000 && typeof image.createdAt === "string" && Number.isFinite(Date.parse(image.createdAt))))) return false;
  for (const field of ["format", "brief"] as const) if (item[field] !== undefined && (typeof item[field] !== "string" || item[field].length > 100_000)) return false;
  if (item.briefUrl !== undefined && item.briefUrl !== null && (typeof item.briefUrl !== "string" || item.briefUrl.length > 2048 || !/^https:\/\/(docs\.google\.com\/document\/d\/|drive\.google\.com\/)/i.test(item.briefUrl))) return false;
  for (const field of ["startDate", "deadline"] as const) if (item[field] !== undefined && !isCalendarDate(item[field])) return false;
  if (item.reminderDate !== undefined && item.reminderDate !== null && !isCalendarDate(item.reminderDate)) return false;
  if (item.reminderTime !== undefined && item.reminderTime !== null && !isClockTime(item.reminderTime)) return false;
  if (item.reminderRepeat !== undefined && !["none", "daily", "weekly"].includes(item.reminderRepeat as string)) return false;
  if (item.reminderOffsets !== undefined && (!Array.isArray(item.reminderOffsets) || item.reminderOffsets.length > 5 || !item.reminderOffsets.every((offset: unknown) => Number.isInteger(offset) && (offset as number) >= 0 && (offset as number) <= 10080) || new Set(item.reminderOffsets).size !== item.reminderOffsets.length)) return false;
  if (item.reminderTime && !item.reminderDate) return false;
  if (item.reminderDate && !item.reminderTime) return false;
  for (const field of ["startTime", "endTime"] as const) if (item[field] !== undefined && !isClockTime(item[field])) return false;
  if (item.workType !== undefined && !WORK_TYPES.includes(item.workType as TaskInput["workType"])) return false;
  if (item.status !== undefined && !TASK_STATUSES.includes(item.status as TaskInput["status"])) return false;
  if (typeof item.startDate === "string" && typeof item.deadline === "string" && item.startDate > item.deadline) return false;
  if (typeof item.startTime === "string" && typeof item.endTime === "string" && item.startTime >= item.endTime) return false;
  return true;
}

export function isTaskInput(value: unknown): value is TaskInput {
  return isTaskPatch(value) && fields.filter((field) => !["assigneeIds", "linkedBriefIds", "briefUrl", "briefFinalUrl", "briefImages", "reminderDate", "reminderTime", "reminderRepeat", "reminderOffsets"].includes(field)).every((field) => value[field] !== undefined);
}
