"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { requestJson } from "../../lib/client-request";
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from "../../lib/project-settings";
import { useAuth } from "./AuthProvider";

type ContextValue = { settings: ProjectSettings; loading: boolean; error: string | null; save: (settings: ProjectSettings) => Promise<void>; refresh: () => Promise<void> };
const Context = createContext<ContextValue | null>(null);
const CHANGE_KEY = "k-mkt-project-settings-changed";

function readableAccent(hex: string) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  for (let scale = 0.78; scale >= 0; scale -= 0.04) {
    const rgb = channels.map((value) => Math.round(value * scale));
    const luminance = rgb.map((value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
    if (1.05 / (0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2] + 0.05) >= 4.5) return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  return "#000000";
}

function applySettings(settings: ProjectSettings) {
  const root = document.documentElement;
  root.style.setProperty("--accent", settings.accentColor);
  root.style.setProperty("--accent-strong", readableAccent(settings.accentColor));
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${settings.accentColor} 12%, white)`);
  root.style.setProperty("--workspace-background-image", settings.backgroundImage ? `url("${settings.backgroundImage}")` : "none");
  root.dataset.backgroundPreset = settings.backgroundPreset;
}

export function ProjectSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [settings, setSettings] = useState(DEFAULT_PROJECT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await requestJson<{ settings: ProjectSettings }>("/api/settings", { cache: "no-store" });
      setSettings(result.settings); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải cài đặt."); }
    finally { setLoading(false); }
  }, [userId]);
  useEffect(() => {
    if (!userId) { setSettings(DEFAULT_PROJECT_SETTINGS); setLoading(false); return; }
    setLoading(true);
    void refresh();
    const sync = (event: StorageEvent) => { if (event.key === CHANGE_KEY) void refresh(); };
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(focus, 60_000);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { window.clearInterval(timer); window.removeEventListener("storage", sync); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [userId, refresh]);
  useEffect(() => { applySettings(settings); }, [settings]);
  const save = async (next: ProjectSettings) => {
    const result = await requestJson<{ settings: ProjectSettings }>("/api/settings", { method: "PATCH", body: JSON.stringify(next) });
    setSettings(result.settings); setError(null);
    try { localStorage.setItem(CHANGE_KEY, String(Date.now())); } catch { /* Other tabs can refresh later. */ }
  };
  return <Context.Provider value={{ settings, loading, error, save, refresh }}>{children}</Context.Provider>;
}

export function useProjectSettings() {
  const context = useContext(Context);
  if (!context) throw new Error("useProjectSettings phải được dùng bên trong ProjectSettingsProvider.");
  return context;
}
