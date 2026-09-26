"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { requestJson } from "../../lib/client-request";
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from "../../lib/project-settings";
import { useAuth } from "./AuthProvider";

type ContextValue = { settings: ProjectSettings; loading: boolean; error: string | null; logoRevision: number; save: (settings: ProjectSettings) => Promise<void>; refresh: () => Promise<void> };
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
  root.dataset.theme = settings.themeMode === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : settings.themeMode;
  root.dataset.contrast = settings.highContrast ? "high" : "normal";
}

export function ProjectSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [settings, setSettings] = useState(DEFAULT_PROJECT_SETTINGS);
  const [logoRevision, setLogoRevision] = useState(0);
  const logoUrlRef = useRef("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setLogoRevision(Date.now()); }, []);
  const refresh = useCallback(async () => {
    try {
      if (!userId) {
        const { brand } = await requestJson<{ brand: { projectName: string; projectLogoUrl: string } }>("/api/brand", { cache: "no-store" });
        setSettings((current) => ({ ...current, projectName: brand.projectName, projectLogoUrl: brand.projectLogoUrl }));
        setError(null);
        return;
      }
      const result = await requestJson<{ settings: ProjectSettings }>("/api/settings", { cache: "no-store" });
      setSettings(result.settings); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải cài đặt."); }
    finally { setLoading(false); }
  }, [userId]);
  useEffect(() => {
    if (!userId) {
      setLoading(true);
      void refresh().finally(() => setLoading(false));
      return;
    }
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
  useEffect(() => {
    if (logoUrlRef.current === settings.projectLogoUrl) return;
    logoUrlRef.current = settings.projectLogoUrl;
    setLogoRevision((revision) => revision + 1);
  }, [settings.projectLogoUrl]);
  useEffect(() => {
    applySettings(settings);
    if (settings.themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => { document.documentElement.dataset.theme = media.matches ? "dark" : "light"; };
    media.addEventListener("change", updateTheme);
    return () => media.removeEventListener("change", updateTheme);
  }, [settings]);
  const save = async (next: ProjectSettings) => {
    const result = await requestJson<{ settings: ProjectSettings }>("/api/settings", { method: "PATCH", body: JSON.stringify(next) });
    setSettings(result.settings); setError(null);
    try { localStorage.setItem(CHANGE_KEY, String(Date.now())); } catch { /* Other tabs can refresh later. */ }
  };
  return <Context.Provider value={{ settings, loading, error, logoRevision, save, refresh }}><ProjectFavicon/><>{children}</></Context.Provider>;
}

function ProjectFavicon() {
  const { settings, logoRevision } = useProjectSettings();
  const pathname = usePathname();
  useEffect(() => {
    const source = `/api/brand-icon?v=${logoRevision}`;
    const iconLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"],link[rel="apple-touch-icon"]'));
    if (!iconLinks.some((link) => link.relList.contains("icon"))) {
      const link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
      iconLinks.push(link);
    }
    if (!iconLinks.some((link) => link.rel === "apple-touch-icon")) {
      const link = document.createElement("link");
      link.rel = "apple-touch-icon";
      document.head.appendChild(link);
      iconLinks.push(link);
    }
    iconLinks.forEach((link) => { if (link.href !== new URL(source, window.location.origin).toString()) link.href = source; });
  }, [pathname, settings.projectLogoUrl, logoRevision]);
  return null;
}

export function useProjectSettings() {
  const context = useContext(Context);
  if (!context) throw new Error("useProjectSettings phải được dùng bên trong ProjectSettingsProvider.");
  return context;
}
