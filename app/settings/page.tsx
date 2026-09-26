"use client";

import { useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useAuth } from "../components/AuthProvider";
import { useProjectSettings } from "../components/ProjectSettingsProvider";
import { playNotificationTone } from "../../lib/notification-sound";
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from "../../lib/project-settings";
import { can } from "../../lib/permissions";
import { DriveImage } from "../components/DriveImage";

const colors = ["#E53935", "#C62828", "#B71C1C", "#D84A60", "#AD3846", "#6D4CBE", "#2563EB", "#00897B", "#388E3C", "#B7791F", "#344054", "#111827"];
const backgrounds: Array<{ id: ProjectSettings["backgroundPreset"]; label: string }> = [
  { id: "blush", label: "Hồng kính" }, { id: "light", label: "Trắng sáng" }, { id: "rose", label: "Đỏ dịu" }
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { settings, loading, error: loadError, save, refresh, logoRevision } = useProjectSettings();
  const [draft, setDraft] = useState<ProjectSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  useEffect(() => { if (!dirtyRef.current) setDraft(settings); }, [settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const update = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => { dirtyRef.current = true; setMessage(null); setDraft((current) => ({ ...current, [key]: value })); };
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
    try { await save(draft); dirtyRef.current = false; setMessage("Đã lưu cài đặt dự án."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu cài đặt."); }
    finally { savingRef.current = false; setSaving(false); }
  };
  if (!can(user, "project.settings.update")) return <WorkspaceShell title="Cài đặt dự án"><div className="access-denied"><h1>Không có quyền</h1><p>Chỉ quản trị viên được thay đổi cài đặt dự án.</p></div></WorkspaceShell>;
  return <WorkspaceShell title="Cài đặt dự án"><div className="page-heading"><div><small>WORKSPACE / SETTINGS</small><h1>Cài đặt dự án</h1><p>Quản lý thông tin, thông báo và giao diện workspace.</p></div></div>
    {loadError && <div className="workspace-sync-error" role="alert">{loadError} <button type="button" className="text-button" onClick={() => void refresh()}>Thử lại</button></div>}
    <form className="project-settings" onSubmit={submit} aria-busy={saving || loading}>
      <fieldset className="settings-fields" disabled={saving || loading}>
      <section className="settings-card"><div><h2>Tổng quan dự án</h2><p>Thông tin này được dùng thống nhất trong điều hướng workspace.</p></div><div className="form-grid settings-project-fields"><label className="field full">Tên dự án<input required maxLength={100} value={draft.projectName} onChange={(event) => update("projectName", event.target.value)} placeholder="Tên dự án"/></label><label className="field full">Mô tả<textarea maxLength={1000} rows={3} value={draft.projectDescription} onChange={(event) => update("projectDescription", event.target.value)} placeholder="Mô tả ngắn về dự án"/></label><label className="field full">Đường dẫn logo (tuỳ chọn)<input type="url" maxLength={2048} value={draft.projectLogoUrl} onChange={(event) => update("projectLogoUrl", event.target.value)} placeholder="Dán link ảnh hoặc link chia sẻ Google Drive"/></label></div>{draft.projectLogoUrl && <div className="settings-image-preview"><DriveImage key={`${draft.projectLogoUrl}:${logoRevision}`} src={draft.projectLogoUrl} alt="Xem trước logo dự án" fallback="Không thể tải ảnh. Kiểm tra quyền chia sẻ Drive: Bất kỳ ai có đường liên kết." cacheKey={logoRevision}/><button type="button" className="secondary" onClick={() => update("projectLogoUrl", "")}>Bỏ logo</button></div>}</section>
      <section className="settings-card"><div><h2>Thông báo của dự án</h2><p>Bật hoặc tắt các loại thông báo đang được workspace hỗ trợ.</p></div><div className="settings-notification-events">{([ ["task_assigned", "Khi được giao công việc"], ["task_due", "Công việc đến hạn / nhắc theo lịch"], ["task_overdue", "Công việc quá hạn"] ] as const).map(([kind, label]) => <label key={kind}><input type="checkbox" checked={draft.notificationEvents[kind]} onChange={(event) => update("notificationEvents", { ...draft.notificationEvents, [kind]: event.target.checked })}/><span>{label}</span></label>)}</div><small>Các thông báo Brief, bình luận và nhắc đến chưa được hệ thống hiện tại tạo; tuỳ chọn tương ứng sẽ xuất hiện khi các sự kiện đó được triển khai.</small></section>
      <section className="settings-card"><div><h2>Màu chủ đạo</h2><p>Màu dùng cho nút chính, trạng thái chọn và điểm nhấn.</p></div><div className="settings-color-options">{colors.map((color) => <button type="button" key={color} className={draft.accentColor.toLowerCase() === color.toLowerCase() ? "color-swatch selected" : "color-swatch"} style={{ backgroundColor: color }} aria-label={`Chọn màu ${color}`} aria-pressed={draft.accentColor.toLowerCase() === color.toLowerCase()} onClick={() => update("accentColor", color)}/>)}</div><label className="settings-custom-color">Màu tùy chỉnh <input type="color" value={draft.accentColor} onChange={(event) => update("accentColor", event.target.value)}/><code>{draft.accentColor}</code></label></section>
      <section className="settings-card"><div><h2>Chế độ màu</h2><p>Chọn giao diện sáng, tối hoặc đồng bộ theo thiết bị.</p></div><div className="settings-theme-options">{(["light", "dark", "system"] as const).map((mode) => <button type="button" key={mode} className={`theme-option ${mode}${draft.themeMode === mode ? " selected" : ""}`} aria-pressed={draft.themeMode === mode} onClick={() => update("themeMode", mode)}><span>{mode === "light" ? "☀" : mode === "dark" ? "☾" : "◐"}</span>{mode === "light" ? "Sáng" : mode === "dark" ? "Tối" : "Theo thiết bị"}</button>)}</div><label className="settings-contrast"><input type="checkbox" checked={draft.highContrast} onChange={(event) => update("highContrast", event.target.checked)}/> Tăng độ tương phản chữ và viền</label></section>
      <section className="settings-card"><div><h2>Nền workspace</h2><p>Chọn nền sáng để chữ và các thẻ kính luôn dễ đọc.</p></div><div className="settings-background-options">{backgrounds.map((preset) => <button type="button" key={preset.id} className={`background-option ${preset.id}${draft.backgroundPreset === preset.id ? " selected" : ""}`} aria-pressed={draft.backgroundPreset === preset.id} onClick={() => update("backgroundPreset", preset.id)}><span/>{preset.label}</button>)}</div><label className="settings-upload">Ảnh nền riêng <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => upload(event.target.files?.[0])}/></label>{draft.backgroundImage && <div className="settings-image-preview"><img src={draft.backgroundImage} alt="Xem trước ảnh nền"/><button type="button" className="secondary" onClick={() => update("backgroundImage", null)}>Bỏ ảnh nền</button></div>}<small>Ảnh sẽ phủ sau các thẻ kính. Giới hạn 750 KB.</small></section>
      <section className="settings-card"><div><h2>Âm thanh thông báo</h2><p>Âm phát khi có thông báo mới và tab đang mở; mỗi người vẫn có thể tắt âm trên thiết bị của mình.</p></div><div className="settings-sound-row"><select value={draft.notificationTone} onChange={(event) => update("notificationTone", event.target.value as ProjectSettings["notificationTone"])}><option value="chime">Chuông rõ</option><option value="soft">Chuông nhẹ</option><option value="silent">Không âm thanh</option></select><button type="button" className="secondary" disabled={draft.notificationTone === "silent"} onClick={() => void previewSound()}>Nghe thử</button></div></section>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="settings-success" role="status">{message}</p>}
      <div className="settings-actions"><button type="button" className="secondary" disabled={saving || loading || !dirty} onClick={() => { dirtyRef.current = true; setDraft(DEFAULT_PROJECT_SETTINGS); setMessage(null); }}>Khôi phục mặc định</button><button type="submit" className="primary" disabled={saving || loading || !dirty}>{saving ? "Đang lưu…" : "Lưu cài đặt"}</button></div>
    </form>
  </WorkspaceShell>;
}
