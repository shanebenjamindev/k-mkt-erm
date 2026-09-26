export type NotificationTone = "chime" | "soft" | "silent";
export type BackgroundPreset = "blush" | "light" | "rose";
export type ThemeMode = "light" | "dark" | "system";
export type ProjectNotificationKind = "task_assigned" | "task_due" | "task_overdue";
export type ProjectSettings = {
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
  return typeof settings.projectName === "string" && settings.projectName.trim().length > 0 && settings.projectName.length <= 100
    && typeof settings.projectDescription === "string" && settings.projectDescription.length <= 1000
    && typeof logoUrl === "string" && logoUrl.length <= 2048 && (!logoUrl || /^https?:\/\//i.test(logoUrl))
    && Boolean(events) && ["task_assigned", "task_due", "task_overdue"].every((kind) => typeof events?.[kind] === "boolean")
    && typeof settings.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(settings.accentColor)
    && ["blush", "light", "rose"].includes(settings.backgroundPreset as string)
    && (settings.backgroundImage === null || (typeof settings.backgroundImage === "string" && settings.backgroundImage.length <= 1_000_000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(settings.backgroundImage)))
    && ["chime", "soft", "silent"].includes(settings.notificationTone as string)
    && ["light", "dark", "system"].includes(settings.themeMode as string) && typeof settings.highContrast === "boolean";
}
