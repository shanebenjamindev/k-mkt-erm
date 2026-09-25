import { type Task } from "./types";

export const TASK_SORT_OPTIONS = [
  { value: "deadline", label: "Deadline" },
  { value: "startDate", label: "Ngày bắt đầu" },
  { value: "title", label: "Tên công việc" },
  { value: "code", label: "Mã công việc" },
  { value: "owner", label: "Người phụ trách" },
  { value: "workType", label: "Loại công việc" },
  { value: "status", label: "Trạng thái" },
  { value: "createdAt", label: "Ngày tạo" }
] as const;

export type TaskSortKey = (typeof TASK_SORT_OPTIONS)[number]["value"];
export type SortDirection = "asc" | "desc";

const statusRank = { todo: 0, in_progress: 1, pending_review: 2, completed: 3 } as const;
const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

export function sortTasks(tasks: Task[], key: TaskSortKey, direction: SortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...tasks].sort((left, right) => {
    if (key === "status") return (statusRank[left.status] - statusRank[right.status]) * multiplier;
    if (key === "deadline" || key === "startDate") {
      const leftValue = key === "startDate" ? left.startDate ?? left.deadline : left.deadline;
      const rightValue = key === "startDate" ? right.startDate ?? right.deadline : right.deadline;
      if (!leftValue) return 1;
      if (!rightValue) return -1;
      return leftValue.localeCompare(rightValue) * multiplier;
    }
    return collator.compare(left[key], right[key]) * multiplier;
  });
}
