import { statusLabels, workTypeLabels, type Task, type TaskStatus, type WorkType } from "./types";

/**
 * Calendar colour is intentionally driven only by the existing workType enum.
 * Status changes form/icon treatment, never the work-type hue.
 */
export const calendarWorkTypeTokens: Record<WorkType, {
  background: string;
  bar: string;
  text: string;
  completedBackground: string;
}> = {
  inhouse: {
    background: "#E7F0FF",
    bar: "#246BCE",
    text: "#173E76",
    completedBackground: "#EFF4F9"
  },
  outsource: {
    background: "#F2E9FF",
    bar: "#7C3AED",
    text: "#4C277B",
    completedBackground: "#F5F0FA"
  }
};

export const calendarAlertTokens = {
  border: "#D92D20",
  background: "#FFF0EE",
  text: "#A61B13"
} as const;

export const calendarStatusPresentation: Record<TaskStatus, { icon: string; label: string; style: "todo" | "in_progress" | "pending_review" | "completed" }> = {
  todo: { icon: "○", label: statusLabels.todo, style: "todo" },
  in_progress: { icon: "◔", label: statusLabels.in_progress, style: "in_progress" },
  pending_review: { icon: "◌", label: statusLabels.pending_review, style: "pending_review" },
  completed: { icon: "✓", label: statusLabels.completed, style: "completed" }
};

function vietnamNowKey(now: Date) {
  const pieces = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${pieces.year}-${pieces.month}-${pieces.day}T${pieces.hour}:${pieces.minute}`;
}

/** Pure derived state: exact end minute is still on time; completed work is never overdue. */
export function getCalendarTaskPresentation(task: Pick<Task, "workType" | "status" | "deadline" | "endTime">, now = new Date()) {
  const isOverdue = task.status !== "completed" && Boolean(task.deadline) && `${task.deadline}T${task.endTime || "23:59"}` < vietnamNowKey(now);
  return {
    type: calendarWorkTypeTokens[task.workType],
    typeLabel: workTypeLabels[task.workType],
    status: calendarStatusPresentation[task.status],
    isOverdue
  };
}
