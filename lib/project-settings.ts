export type NotificationTone = "chime" | "soft" | "silent";
export type BackgroundPreset = "blush" | "light" | "rose";
export type ProjectSettings = { accentColor: string; backgroundPreset: BackgroundPreset; backgroundImage: string | null; notificationTone: NotificationTone };

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = { accentColor: "#E53935", backgroundPreset: "blush", backgroundImage: null, notificationTone: "chime" };

export function isProjectSettings(value: unknown): value is ProjectSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return typeof settings.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(settings.accentColor)
    && ["blush", "light", "rose"].includes(settings.backgroundPreset as string)
    && (settings.backgroundImage === null || (typeof settings.backgroundImage === "string" && settings.backgroundImage.length <= 1_000_000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(settings.backgroundImage)))
    && ["chime", "soft", "silent"].includes(settings.notificationTone as string);
}
