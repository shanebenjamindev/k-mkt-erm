import { TASK_STATUSES, statusLabels, type TaskStatus } from "./types";
export type WorkflowStep = { status: TaskStatus; label: string; color?: string };
export const WORKFLOW_COLORS: Record<TaskStatus, string> = { todo: "#8a94a5", in_progress: "#2d6fd5", pending_review: "#d79118", completed: "#2aa970" };
export function workflowTextColor(color: string) {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? "#172033" : "#ffffff";
}
export const DEFAULT_WORKFLOW: WorkflowStep[] = TASK_STATUSES.map(status => ({ status, label: statusLabels[status], color: WORKFLOW_COLORS[status] }));
export function isWorkflow(value: unknown): value is WorkflowStep[] {
  return Array.isArray(value) && value.length === TASK_STATUSES.length && new Set(value.map(step => step?.status)).size === TASK_STATUSES.length && value.every(step => step && TASK_STATUSES.includes(step.status) && typeof step.label === "string" && step.label.trim().length > 0 && step.label.length <= 80 && (step.color === undefined || typeof step.color === "string" && /^#[0-9a-fA-F]{6}$/.test(step.color)));
}
export function normalizeWorkflow(value: unknown): WorkflowStep[] { return isWorkflow(value) ? value.map(step => ({ status: step.status, label: step.label.trim(), color: step.color ?? WORKFLOW_COLORS[step.status] })) : DEFAULT_WORKFLOW; }
export type NotificationTone = "chime" | "soft" | "silent";
export type BackgroundPreset = "blush" | "light" | "rose";
export type ThemeMode = "light" | "dark" | "system";
export type ProjectNotificationKind = "task_assigned" | "task_due" | "task_overdue";
export type ProjectSettings = {
  workflow?: WorkflowStep[];
  projectName: string;
  projectDescription: string;
  projectLogoUrl: string;
  notificationEvents: Record<ProjectNotificationKind, boolean>;
  accentColor: string;
  backgroundPreset: BackgroundPreset;
  backgroundImage: string | null;
  notificationTone: NotificationTone;
  themeMode: ThemeMode;
  highContrast: boolean;
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  workflow: DEFAULT_WORKFLOW,
  projectName: "K-MKT Workspace",
  projectDescription: "",
  projectLogoUrl: "",
  notificationEvents: { task_assigned: true, task_due: true, task_overdue: true },
  accentColor: "#E53935",
  backgroundPreset: "blush",
  backgroundImage: null,
  notificationTone: "chime",
  themeMode: "light",
  highContrast: false
};

export function isProjectSettings(value: unknown): value is ProjectSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  const events = settings.notificationEvents as Record<string, unknown> | undefined;
  const logoUrl = settings.projectLogoUrl;
  return (settings.workflow === undefined || isWorkflow(settings.workflow)) && typeof settings.projectName === "string" && settings.projectName.trim().length > 0 && settings.projectName.length <= 100
    && typeof settings.projectDescription === "string" && settings.projectDescription.length <= 1000
    && typeof logoUrl === "string" && logoUrl.length <= 2048 && (!logoUrl || /^https?:\/\//i.test(logoUrl))
    && Boolean(events) && ["task_assigned", "task_due", "task_overdue"].every((kind) => typeof events?.[kind] === "boolean")
    && typeof settings.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(settings.accentColor)
    && ["blush", "light", "rose"].includes(settings.backgroundPreset as string)
    && (settings.backgroundImage === null || (typeof settings.backgroundImage === "string" && settings.backgroundImage.length <= 1_000_000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(settings.backgroundImage)))
    && ["chime", "soft", "silent"].includes(settings.notificationTone as string)
    && ["light", "dark", "system"].includes(settings.themeMode as string) && typeof settings.highContrast === "boolean";
}
