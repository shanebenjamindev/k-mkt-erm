"use client";

import { useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useAuth } from "../components/AuthProvider";
import { useProjectSettings } from "../components/ProjectSettingsProvider";
import { playNotificationTone } from "../../lib/notification-sound";
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from "../../lib/project-settings";

const colors = ["#E53935", "#C62828", "#B71C1C", "#D84A60", "#AD3846"];
const backgrounds: Array<{ id: ProjectSettings["backgroundPreset"]; label: string }> = [
  { id: "blush", label: "Hồng kính" }, { id: "light", label: "Trắng sáng" }, { id: "rose", label: "Đỏ dịu" }
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { settings, loading, error: loadError, save, refresh } = useProjectSettings();
  const [draft, setDraft] = useState<ProjectSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  useEffect(() => { setDraft(settings); }, [settings]);
  const update = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const upload = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) { setError("Chọn ảnh PNG, JPEG, WebP hoặc GIF."); return; }
    if (file.size > 750_000) { setError("Ảnh nền phải nhỏ hơn 750 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") { update("backgroundImage", reader.result); setError(null); } };
    reader.onerror = () => setError("Không thể đọc ảnh nền.");
    reader.readAsDataURL(file);
  };
  const previewSound = async () => {
    if (draft.notificationTone === "silent") return;
    const context = new AudioContext();
    try { await context.resume(); playNotificationTone(context, draft.notificationTone); window.setTimeout(() => void context.close(), 800); }
    catch { await context.close().catch(() => undefined); setError("Trình duyệt chưa cho phép phát âm thanh."); }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError(null); setMessage(null);
    try { await save(draft); setMessage("Đã lưu cài đặt cho workspace."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu cài đặt."); }
    finally { savingRef.current = false; setSaving(false); }
  };
  if (user?.accessRole !== "admin") return <WorkspaceShell title="Cài đặt dự án"><div className="access-denied"><h1>Không có quyền</h1><p>Chỉ quản trị viên được thay đổi giao diện chung.</p></div></WorkspaceShell>;
  return <WorkspaceShell title="Cài đặt dự án"><div className="page-heading"><div><small>WORKSPACE / SETTINGS</small><h1>Cài đặt dự án</h1><p>Tùy chỉnh giao diện và âm báo cho cả workspace.</p></div></div>
    {loadError && <div className="workspace-sync-error" role="alert">{loadError} <button type="button" className="text-button" onClick={() => void refresh()}>Thử lại</button></div>}
    <form className="project-settings" onSubmit={submit} aria-busy={saving || loading}>
      <section className="settings-card"><div><h2>Màu chủ đạo</h2><p>Màu dùng cho nút chính, trạng thái chọn và điểm nhấn.</p></div><div className="settings-color-options">{colors.map((color) => <button type="button" key={color} className={draft.accentColor.toLowerCase() === color.toLowerCase() ? "color-swatch selected" : "color-swatch"} style={{ backgroundColor: color }} aria-label={`Chọn màu ${color}`} aria-pressed={draft.accentColor.toLowerCase() === color.toLowerCase()} onClick={() => update("accentColor", color)}/>)}</div><label className="settings-custom-color">Màu tùy chỉnh <input type="color" value={draft.accentColor} onChange={(event) => update("accentColor", event.target.value)}/><code>{draft.accentColor}</code></label></section>
      <section className="settings-card"><div><h2>Nền workspace</h2><p>Chọn nền sáng để chữ và các thẻ kính luôn dễ đọc.</p></div><div className="settings-background-options">{backgrounds.map((preset) => <button type="button" key={preset.id} className={`background-option ${preset.id}${draft.backgroundPreset === preset.id ? " selected" : ""}`} aria-pressed={draft.backgroundPreset === preset.id} onClick={() => update("backgroundPreset", preset.id)}><span/>{preset.label}</button>)}</div><label className="settings-upload">Ảnh nền riêng <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => upload(event.target.files?.[0])}/></label>{draft.backgroundImage && <div className="settings-image-preview"><img src={draft.backgroundImage} alt="Xem trước ảnh nền"/><button type="button" className="secondary" onClick={() => update("backgroundImage", null)}>Bỏ ảnh nền</button></div>}<small>Ảnh sẽ phủ sau các thẻ kính. Giới hạn 750 KB.</small></section>
      <section className="settings-card"><div><h2>Âm thanh thông báo</h2><p>Âm phát khi có thông báo mới và tab đang mở; mỗi người vẫn có thể tắt âm trên thiết bị của mình.</p></div><div className="settings-sound-row"><select value={draft.notificationTone} onChange={(event) => update("notificationTone", event.target.value as ProjectSettings["notificationTone"])}><option value="chime">Chuông rõ</option><option value="soft">Chuông nhẹ</option><option value="silent">Không âm thanh</option></select><button type="button" className="secondary" disabled={draft.notificationTone === "silent"} onClick={() => void previewSound()}>Nghe thử</button></div></section>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="settings-success" role="status">{message}</p>}
      <div className="settings-actions"><button type="button" className="secondary" onClick={() => { setDraft(DEFAULT_PROJECT_SETTINGS); setMessage(null); }}>Khôi phục mặc định</button><button type="submit" className="primary" disabled={saving || loading}>{saving ? "Đang lưu…" : "Lưu cài đặt"}</button></div>
    </form>
  </WorkspaceShell>;
}
